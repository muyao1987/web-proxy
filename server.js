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
    port: {
      default: 1987,
      description: "监听端口",
    },
    public: {
      type: "boolean",
      description: "运行监听端口是否为公开服务",
    },
    "upstream-proxy": {
      description:
        'A standard proxy server that will be used to retrieve data.  Specify a URL including port, e.g. "http://proxy:8000".',
    },
    "bypass-upstream-proxy-hosts": {
      description:
        'A comma separated list of hosts that will bypass the specified upstream_proxy, e.g. "lanhost1,lanhost2"',
    },
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

  // eventually this mime type configuration will need to change
  // *NOTE* Any changes you make here must be mirrored in web.config.
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

  var app = express();
  app.use(compression());
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

  var dontProxyHeaderRegex =
    /^(?:Host|Proxy-Connection|Connection|Keep-Alive|Transfer-Encoding|TE|Trailer|Proxy-Authorization|Proxy-Authenticate|Upgrade)$/i;

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

  var upstreamProxy = argv["upstream-proxy"];
  var bypassUpstreamProxyHosts = {};
  if (argv["bypass-upstream-proxy-hosts"]) {
    argv["bypass-upstream-proxy-hosts"].split(",").forEach(function (host) {
      bypassUpstreamProxyHosts[host.toLowerCase()] = true;
    });
  }
  // const WHITE_LIST = [/marsgis|mars2d|mars3d/, /localhost|127\.0\.0\.1/];
  app.get("/proxy/*", function (req, res, next) {
    const origin = req.get("origin");
    // const hasAuth = WHITE_LIST.some((rule) => {
    //   if (typeof rule === "string") {
    //     return rule === origin;
    //   } else {
    //     return rule.test(origin);
    //   }
    // });

    // if (!hasAuth) {
    //   console.log("hasAuth-------------->", hasAuth);
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
      // remoteUrl = Object.keys(req.query)[0];
      remoteUrl = req.originalUrl.split('?').slice(1).join('?')
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

  //取随机点
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
