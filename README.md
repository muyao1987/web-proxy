# web代理服务
  这是一个基于Node编写的web代理服务器。用于解决web站点的跨域请求问题，和GIS（如Cesium平台下）开发中资源跨域请求问题的解决。
 
 
## 运行命令
 
### 首次运行前安装依赖
 `npm install` 或 `cnpm install`
 
### 运行启动代理服务
 `npm run serve` 



## 使用说明
  按命令运行启动后，打开浏览`http://localhost:1987/proxy/` 将该地址放在之前原有请求url前即可。

比如原请求地址为：`http://www.google.cn/maps/vt?lyrs=s&x=0&y=0&z=0`  
加代理后请求地址为：`http://localhost:1987/proxy/http://www.google.cn/maps/vt?lyrs=s&x=0&y=0&z=0`

### 运行效果 
 [在线Demo](https://data.marsgis.cn/proxy/http://www.google.cn/maps/vt?lyrs=s&x=0&y=0&z=0)     

 

### Cesium技术栈下 
 在Resource类中传入proxy属性即可 
```javascript
var resource = new Cesium.Resource({
    url : 'http://www.earthenterprise.org/3d',
    proxy : new Cesium.DefaultProxy('http://localhost:1987/proxy/')
}
```
 

 
### Mars3D技术栈下 
 在config.json或相关图层配置proxy属性即可
```javascript 
var imageryProvider = mars3d.layer.createImageryProvider({
    type: "www_tdt",
    layer: "img_d",
    key: [
        "313cd4b28ed520472e8b43de00b2de56",
        "83b36ded6b43b9bc81fbf617c40b83b5",
        "0ebd57f93a114d146a954da4ecae1e67",
        "6c99c7793f41fccc4bd595b03711913e",
        "56b81006f361f6406d0e940d2f89a39c"
    ],
    proxy: "http://data.marsgis.cn/proxy/",  //代理服务
});
```


  