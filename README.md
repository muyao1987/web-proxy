# web代理服务

## 项目简介

这是一个基于 Node.js + Express 编写的 web 代理服务器，用于解决 web 站点的跨域请求问题，以及 GIS（如 Cesium 平台下）开发中资源跨域请求问题的解决。

## 功能特性

- **跨域代理**：提供 `/proxy/*` 通用代理接口，将原始请求 URL 拼接在代理前缀后即可转发请求、原样返回远程响应，解决浏览器跨域限制；
- **静态资源服务**：以程序目录为根提供静态资源访问，并为 3D Tiles（b3dm、pnts、i3dm、cmpt、glb 等）及 json/gltf/glsl 等 GIS 常用扩展名配置了 MIME 类型；
- **gzip 探测**：对已知瓦片格式自动探测 gzip 文件头并标记 `Content-Encoding`，保证压缩数据正确返回；
- **随机点模拟接口**：提供 `/server/pointRandom/*` 接口，在指定经纬度范围内随机生成点数据，便于前端开发调试；
- **CORS 支持**：全局设置跨域响应头，并自动处理 OPTIONS 预检请求。

## 环境要求

- [Node.js](https://nodejs.org/)（建议 8.x 及以上版本）

## 安装

首次运行前安装依赖：

`npm install` 或 `cnpm install`

## 启动命令

- 启动代理服务：`npm run serve`（等价于 `node server.js --public`，作为公开服务运行）
- Windows 下也可直接双击 `start.bat` 启动

默认监听端口为 `1987`，启动后浏览器访问 `http://localhost:1987/` 查看说明页。

### 命令行参数

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `--port` | 监听端口 | `1987` |
| `--public` | 是否作为公开服务运行（监听所有网卡，否则仅本机 localhost 可访问） | 否 |
| `--upstream-proxy` | 上游标准代理服务器地址（含端口），如 `"http://proxy:8000"`，代理请求将经由它转发 | 无 |
| `--bypass-upstream-proxy-hosts` | 不走上游代理的主机列表（逗号分隔），如 `"lanhost1,lanhost2"` | 无 |
| `-h, --help` | 显示帮助信息 | - |

示例：`node server.js --port 9000 --public`

## 使用说明

### 代理服务

按命令运行启动后，打开浏览器访问 `http://localhost:1987/proxy/`，将该地址放在之前原有请求 url 前即可。

比如原请求地址为：`http://mt1.google.cn/vt/lyrs=s&x=0&y=0&z=0`
加代理后请求地址为：`http://localhost:1987/proxy/http://mt1.google.cn/vt/lyrs=s&x=0&y=0&z=0`

#### 运行效果

[在线Demo](https://server.mars3d.cn/proxy/http://mt1.google.cn/vt/lyrs=s&x=0&y=0&z=0)

#### Cesium 技术栈下

在 Resource 类中传入 proxy 属性即可

```javascript
var resource = new Cesium.Resource({
    url : 'http://www.earthenterprise.org/3d',
    proxy : new Cesium.DefaultProxy('http://localhost:1987/proxy/')
});
```

#### Mars3D 技术栈下

在 config.json 或相关图层配置 proxy 属性即可，具体参考支持 proxy 属性的类的[API文档](http://mars3d.cn/api/BaseTileLayer.html)

```javascript
  {
        "name": "高德实时路况",
        "type": "gaode",
        "layer": "time",
        "proxy": "http://localhost:1987/proxy/"
  }
```

### 随机点模拟接口

在指定经纬度范围内随机生成指定数量的点，返回 JSON 数组（每项包含 `id`、`name`、`x`、`y` 字段，坐标保留 6 位小数），可用于开发调试：

```
http://localhost:1987/server/pointRandom/point.json?xmin=116.3&ymin=39.8&xmax=116.5&ymax=40.0&count=10
```

查询参数：`xmin`/`ymin` 经纬度最小值、`xmax`/`ymax` 经纬度最大值、`count` 生成点数。

## 目录结构

```
web-proxy
├── server.js      // 服务主程序（代理服务、静态资源、随机点接口）
├── index.html     // 访问根路径时的说明页面
├── start.bat      // Windows 一键启动脚本
├── package.json   // 项目及依赖配置
├── LICENSE        // 许可证文件
├── .gitignore
└── README.md      // 说明文档
```

## 相关链接

- 项目主页：<https://github.com/muyao1987/web-proxy>
- 问题反馈：<https://github.com/muyao1987/web-proxy/issues>

## 许可证

[Apache-2.0](LICENSE)

---

火星科技 (muyao1987)：<http://www.marsgis.cn>
