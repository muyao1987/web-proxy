# web代理服务
  这是一个基于Node编写的web代理服务器。用于解决web站点的跨域请求问题，和GIS（如Cesium平台下）开发中资源跨域请求问题的解决。
 
 
## 运行命令
 
### 首次运行前安装依赖
 `npm install` 或 `cnpm install`
 
### 运行启动代理服务
 `npm run serve` 



## 使用说明
  按命令运行启动后，打开浏览`http://localhost:1987/proxy/` 将该地址放在之前原有请求url前即可。

比如原请求地址为：`http://mt1.google.cn/vt/lyrs=s&x=0&y=0&z=0`  
加代理后请求地址为：`http://localhost:1987/proxy/http://mt1.google.cn/vt/lyrs=s&x=0&y=0&z=0`

### 运行效果 
 [在线Demo](https://data.marsgis.cn/proxy/http://mt1.google.cn/vt/lyrs=s&x=0&y=0&z=0)     

 

### Cesium技术栈下 
 在Resource类中传入proxy属性即可 
```javascript
var resource = new Cesium.Resource({
    url : 'http://www.earthenterprise.org/3d',
    proxy : new Cesium.DefaultProxy('http://localhost:1987/proxy/')
}
```
 

 
### Mars3D技术栈下 
 在config.json或相关图层配置proxy属性即可，具体参考支持proxy属性的类的[API文档](http://mars3d.cn/api/BaseTileLayer.html)
```javascript 
  {
        "name": "高德实时路况",
        "type": "gaode",
        "layer": "time",
        "proxy": "http://data.marsgis.cn/proxy/"
  }
```


  
