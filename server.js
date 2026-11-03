/**
 * web-proxy 前端开发代理服务器（Node.js + Express）
 *
 * 用途：
 *   1. 提供 /proxy/* 跨域代理接口，解决 Web 站点（尤其是 Cesium/Mars3D 等 GIS 平台）
 *      开发中的资源跨域请求问题；
 *   2. 以当前目录为根提供静态资源服务，并对 3D Tiles 等已知瓦片格式自动探测 gzip 头；
 *   3. 提供 /server/pointRandom/* 随机点模拟数据接口，便于前端开发调试。
 *
 * 来源：
 *   基于 Cesium 官方 proxy 示例（server.js）改造扩展而来，代码保持 ES5 风格。
 *
 * 启动方式：
 *   1. 首次运行先安装依赖：npm install
 *   2. 启动服务：npm run serve（等价于 node server.js --public），或双击 start.bat；
 *   3. 启动后浏览器访问 http://localhost:1987/ 查看说明，代理前缀为 http://localhost:1987/proxy/。
 *
 * @author 火星科技 木遥 (muyao1987) http://www.marsgis.cn
 * @license Apache-2.0
 * @see https://github.com/muyao1987/web-proxy
 */
/*eslint-env node*/
"use strict";
(function () {
  var express = require("express");
  var compression = require("compression");
  var fs = require("fs");
  var url = require("url");
  var request = require("request");

  var gzipHeader = Buffer.from("1F8B08", "hex");

  var yargs = require("yargs").options({
    // 监听端口，默认 1987
    port: {
      default: 1987,
      description: "监听端口",
    },
    // 是否作为公开服务运行：true 时监听所有网卡（局域网内可访问），否则仅监听 localhost
    public: {
      type: "boolean",
      description: "运行监听端口是否为公开服务",
    },
    // 上游标准代理服务器地址（含端口，如 "http://proxy:8000"），代理请求将经由它转发
    "upstream-proxy": {
      description:
        'A standard proxy server that will be used to retrieve data.  Specify a URL including port, e.g. "http://proxy:8000".',
    },
    // 不走上游代理的主机白名单（逗号分隔，如 "lanhost1,lanhost2"），仅在上游代理生效时使用
    "bypass-upstream-proxy-hosts": {
      description:
        'A comma separated list of hosts that will bypass the specified upstream_proxy, e.g. "lanhost1,lanhost2"',
    },
    // 显示帮助信息
    help: {
      alias: "h",
      type: "boolean",
      description: "Show this help.",
    },
  });
  var argv = yargs.argv;

  if (argv.help) {
    return yargs.showHelp();
  }

  // MIME 类型配置：为 GIS/3D Tiles 常用扩展名补充 MIME 映射（后续可能需要调整）
  // *NOTE* 此处的任何修改必须同步到 web.config（部署 IIS 时）
  var mime = express.static.mime;
  mime.define(
    {
      "application/json": ["czml", "json", "geojson", "topojson"],
      "application/wasm": ["wasm"],
      "image/crn": ["crn"],
      "image/ktx": ["ktx"],
      "model/gltf+json": ["gltf"],
      "model/gltf-binary": ["bgltf", "glb"],
      "application/octet-stream": [
        "b3dm",
        "pnts",
        "i3dm",
        "cmpt",
        "geom",
        "vctr",
      ],
      "text/plain": ["glsl"],
    },
    true
  );

  // 创建 Express 应用并启用 gzip 压缩中间件
  var app = express();
  app.use(compression());
  // 全局 CORS 中间件：设置跨域响应头；对 OPTIONS 预检请求直接返回 200，其余请求放行
  app.use(function (req, res, next) {
    //res.header('Access-Control-Allow-Origin', '*');
    res.header("Access-Control-Allow-Origin", req.headers.origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type"
    );

    if (req.method == "OPTIONS") {
      res.send(200); // 意思是，在正常的请求之前，会发送一个验证，是否可以请求。
    } else {
      next();
    }
  });

  /**
   * gzip 探测中间件：读取本地文件前 3 个字节，与 gzip 文件头（1F8B08）比对，
   * 命中则在响应头标记 Content-Encoding: gzip，确保压缩文件能被正确返回。
   * 文件读取失败时直接放行（next），不影响后续静态资源服务。
   *
   * @param {express.Request} req  请求对象
   * @param {express.Response} res 响应对象
   * @param {Function} next        放行到下一个中间件
   */
  function checkGzipAndNext(req, res, next) {
    var reqUrl = url.parse(req.url, true);
    var filePath = reqUrl.pathname.substring(1);

    var readStream = fs.createReadStream(filePath, { start: 0, end: 2 });
    readStream.on("error", function (err) {
      next();
    });

    readStream.on("data", function (chunk) {
      if (chunk.equals(gzipHeader)) {
        res.header("Content-Encoding", "gzip");
      }
      next();
    });
  }

  // 已知的 3D Tiles/瓦片数据格式（此类文件常以 gzip 形式存储，需要探测 gzip 头）
  var knownTilesetFormats = [
    /\.b3dm/,
    /\.pnts/,
    /\.i3dm/,
    /\.cmpt/,
    /\.glb/,
    /\.geom/,
    /\.vctr/,
    /tileset.*\.json$/,
  ];
  app.get(knownTilesetFormats, checkGzipAndNext);

  app.use(express.static(__dirname));

  /**
   * 从 /proxy/* 路由的通配参数中解析出待代理的远程地址。
   * 兼容请求形式：/proxy/http://example.com/file?query=1
   * 若地址缺少协议则默认补 http://，并把当前请求的查询串（search）复制到目标地址上。
   *
   * @param {express.Request} req 请求对象
   * @returns {(url.Url|undefined)} 解析后的远程地址对象；无有效地址时返回 undefined
   */
  function getRemoteUrlFromParam(req) {
    var remoteUrl = req.params[0];
    if (remoteUrl) {
      // add http:// to the URL if no protocol is present
      if (!/^https?:\/\//.test(remoteUrl)) {
        remoteUrl = "http://" + remoteUrl;
      }
      remoteUrl = url.parse(remoteUrl);
      // copy query string
      remoteUrl.search = url.parse(req.url).search;
    }
    return remoteUrl;
  }

  // 逐跳头（Hop-by-hop Headers）过滤规则：命中这些头不随代理请求/响应转发
  var dontProxyHeaderRegex =
    /^(?:Host|Proxy-Connection|Connection|Keep-Alive|Transfer-Encoding|TE|Trailer|Proxy-Authorization|Proxy-Authenticate|Upgrade)$/i;

  /**
   * 过滤请求/响应头：剔除 dontProxyHeaderRegex 匹配的逐跳头（如 Host、Connection 等），
   * 返回其余头的副本，用于转发到远程服务器或写回浏览器响应。
   *
   * @param {express.Request} req            请求对象
   * @param {Object<string, string>} headers 原始头对象
   * @returns {Object<string, string>} 过滤后的头对象
   */
  function filterHeaders(req, headers) {
    var result = {};
    // filter out headers that are listed in the regex above
    Object.keys(headers).forEach(function (name) {
      if (!dontProxyHeaderRegex.test(name)) {
        result[name] = headers[name];
      }
    });
    return result;
  }

  // 上游代理配置：读取命令行参数，并构造“不走上游代理的主机”映射表
  var upstreamProxy = argv["upstream-proxy"];
  var bypassUpstreamProxyHosts = {};
  if (argv["bypass-upstream-proxy-hosts"]) {
    argv["bypass-upstream-proxy-hosts"].split(",").forEach(function (host) {
      bypassUpstreamProxyHosts[host.toLowerCase()] = true;
    });
  }
  // 域名白名单（预留开关）：供下方被注释的权限校验代码使用，是否启用由使用者自行决定
  const WHITE_LIST = [
    /marsgis\.cn/,
    /mars2d\.cn/,
    /mars3d\.cn/,
    /localhost/,
    /127\.0\.0\.1/
  ];
  /**
   * 跨域代理路由：GET /proxy/*
   * 用法：将原始请求 URL 直接拼接在 /proxy/ 之后，例如：
   *   http://localhost:1987/proxy/http://example.com/file?query=1
   * 服务端转发请求，并将远程响应（含响应头）原样返回给浏览器，从而绕过跨域限制。
   *
   * @param {express.Request} req  请求对象
   * @param {express.Response} res 响应对象
   * @param {Function} next        放行到下一个中间件
   */
  app.get("/proxy/*", function (req, res, next) {
    const origin = req.get("origin") || req.get("referer") || "";
    // const hasAuth = WHITE_LIST.some((rule) => {
    //   return rule.test(origin);
    // });

    // console.log(`origin:${origin},  hasAuth:${hasAuth}`);
    // if (!hasAuth) {
    //   return res
    //     .status(403)
    //     .send(
    //       "当前域名无权限，请自行部署代理服务：https://github.com/muyao1987/web-proxy"
    //     );
    // }

    // look for request like http://localhost:8080/proxy/http://example.com/file?query=1
    var remoteUrl = getRemoteUrlFromParam(req);
    if (!remoteUrl) {
      // look for request like http://localhost:8080/proxy/?http%3A%2F%2Fexample.com%2Ffile%3Fquery%3D1
      remoteUrl = req.originalUrl.split("?").slice(1).join("?");
      if (remoteUrl) {
        remoteUrl = url.parse(remoteUrl);
      }
    }

    if (!remoteUrl) {
      return res
        .status(400)
        .send(
          "请传入 url 参数，可参考：https://github.com/muyao1987/web-proxy"
        );
    }

    if (!remoteUrl.protocol) {
      remoteUrl.protocol = "http:";
    }

    var proxy;
    if (upstreamProxy && !(remoteUrl.host in bypassUpstreamProxyHosts)) {
      proxy = upstreamProxy;
    }

    // encoding : null means "body" passed to the callback will be raw bytes
    var new_url = url.format(remoteUrl);

    console.log("\n" + new Date().toString());
    console.log(new_url);

    request.get(
      {
        url: new_url,
        headers: filterHeaders(req, req.headers),
        encoding: null,
        proxy: proxy,
      },
      function (error, response, body) {
        var code = 500;

        if (response) {
          code = response.statusCode;
          res.header(filterHeaders(req, response.headers));
        }

        res.status(code).send(body);
      }
    );
  });

  /**
   * 随机点模拟数据接口：GET /server/pointRandom/*
   * 查询参数（均为数字）：xmin/ymin 经纬度最小值，xmax/ymax 经纬度最大值，count 生成点数。
   * 在指定经纬度范围内随机生成 count 个点，返回 JSON 数组，
   * 每个元素形如 { id, name, x, y }，坐标保留 6 位小数。
   *
   * @param {express.Request} req  请求对象
   * @param {express.Response} res 响应对象
   * @param {Function} next        放行到下一个中间件
   */
  // 随机点自增编号，用作返回数据的 id/name
  var indexRandom = 0;
  app.get("/server/pointRandom/*", function (req, res, next) {
    var xmin = Number(req.query.xmin);
    var ymin = Number(req.query.ymin);
    var xmax = Number(req.query.xmax);
    var ymax = Number(req.query.ymax);
    var count = Number(req.query.count);

    var arr = [];
    for (var i = 0; i < count; i++) {
      var x = Math.random() * (xmax - xmin) + xmin;
      var y = Math.random() * (ymax - ymin) + ymin;

      x = Number(x.toFixed(6));
      y = Number(y.toFixed(6));

      indexRandom++;
      arr.push({
        id: indexRandom,
        name: "点" + indexRandom,
        x: x,
        y: y,
      });
    }

    res.send(arr);
  });

  // 启动 HTTP 服务：默认仅监听 localhost，传入 --public 时监听所有网卡（公开服务）
  var server = app.listen(
    argv.port,
    argv.public ? undefined : "localhost",
    function () {
      if (argv.public) {
        console.log(
          "MarsGIS开发服务器在公开运行。 请浏览器访问  http://localhost:%d/",
          server.address().port
        );
      } else {
        console.log(
          "MarsGIS开发服务器在本地运行。 请本机浏览器访问 http://localhost:%d/",
          server.address().port
        );
      }
    }
  );

  // 监听服务错误：端口被占用（EADDRINUSE）、无监听权限（EACCES）时给出提示并退出
  server.on("error", function (e) {
    if (e.code === "EADDRINUSE") {
      console.log(
        "Error: Port %d is already in use, select a different port.",
        argv.port
      );
      console.log("Example: node server.js --port %d", argv.port + 1);
    } else if (e.code === "EACCES") {
      console.log(
        "Error: This process does not have permission to listen on port %d.",
        argv.port
      );
      if (argv.port < 1024) {
        console.log("Try a port number higher than 1024.");
      }
    }
    console.log(e);
    process.exit(1);
  });

  server.on("close", function () {
    console.log("MarsGIS开发服务器已关闭.");
  });

  // 退出处理：第一次 Ctrl+C 优雅关闭服务，再次 Ctrl+C 强制退出
  var isFirstSig = true;
  process.on("SIGINT", function () {
    if (isFirstSig) {
      console.log("MarsGIS development server shutting down.");
      server.close(function () {
        process.exit(0);
      });
      isFirstSig = false;
    } else {
      console.log("MarsGIS development server force kill.");
      process.exit(1);
    }
  });
})();
