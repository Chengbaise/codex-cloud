# 拾图漫画源格式 v1

拾图 0.2 支持独立的 JSON 源格式，不执行 JavaScript，不能直接导入 Venera 源脚本。漫画源既可以包含完整目录，也可以声明统一 JSON API。

在「漫画源」中通过文件、HTTPS 网址或粘贴 JSON 导入。`id` 必须唯一，允许字母、数字、下划线和短横线，`demo` 保留。当前不支持自动更新，更新同 ID 的源需先删除旧源再导入；已下载文件和书架记录保留。

## 目录源

```json
{
  "format": "atelier-source-v1",
  "id": "my-comics",
  "name": "我的漫画目录",
  "version": "1.0.0",
  "type": "catalog",
  "comics": [
    {
      "id": "book-1",
      "title": "作品名称",
      "author": "作者名称",
      "cover": "https://your-domain.example/cover.jpg",
      "description": "作品简介",
      "chapters": [
        {
          "id": "chapter-1",
          "title": "第一章",
          "pages": [
            "https://your-domain.example/pages/001.jpg",
            "https://your-domain.example/pages/002.jpg"
          ]
        }
      ]
    }
  ]
}
```

这里的网址是格式占位示例，需替换为你有权访问的图片地址。`examples/catalog.json` 包含可直接导入的内嵌 PNG 测试页，用于验证导入，不是真实漫画源。

`cover` 可省略；`author` 和 `description` 可省略。章节 `pages` 为有序图片数组，不能为空。支持 HTTPS 图片，以及内嵌 PNG/JPEG/GIF/WebP 的 base64 data URL。源 JSON 不支持本地文件路径、HTTP 地址、任意脚本或 SVG。内置演示图是应用自身生成的受控 SVG。

目录源支持独立作品名称、作者及综合搜索，每页 24 部漫画。作品名称模式只匹配 title，作者模式只匹配 author，综合模式分别匹配标题或作者。所有匹配忽略大小写、全半角、空格和标点。

- contains：包含部分名称。
- exact：规范化后完整匹配。
- fuzzy：包含匹配、有序缩写匹配；完整查询至少三字时支持一处插入、删除、替换或相邻字互换。

结果按完整名称、包含、缩写、近似名称排序，相同相关度保持原目录顺序。空查询返回全部作品。

## API 源

```json
{
  "format": "atelier-source-v1",
  "id": "my-api",
  "name": "我的 API 源",
  "version": "1.0.0",
  "type": "api",
  "baseUrl": "https://your-domain.example/",
  "endpoints": {
    "browse": "/comics?page={page}",
    "search": "/search?q={query}&mode={mode}&match={match}&page={page}",
    "detail": "/comics/{id}",
    "chapter": "/comics/{id}/chapters/{chapterId}"
  }
}
```

接口均使用 HTTPS GET，必须与 baseUrl 同源。占位符会进行 URL 编码。页码从 1 开始，mode 为 title（作品名称）、keyword（综合）或 artist（作者），match 为 contains、fuzzy 或 exact。API 应实现相应搜索语义；客户端不对未返回的远端目录做全库模糊搜索。旧 API 模板可以不使用 {match}，但界面选择的匹配方式不会自动改变该 API 的行为。自定义请求头、登录表单、验证码和加密脚本目前不属于此格式。

目录和搜索返回：

```json
{"items":[{"id":"book-1","title":"作品名称","author":"作者","cover":"https://your-domain.example/cover.jpg"}],"hasMore":false}
```

详情返回（章节列表的 pages 可省略）：

```json
{"id":"book-1","title":"作品名称","author":"作者","description":"简介","chapters":[{"id":"chapter-1","title":"第一章"}]}
```

章节返回：

```json
{"pages":["https://your-domain.example/001.jpg","https://your-domain.example/002.jpg"]}
```

图片由 Electron 的隔离会话请求，不受网页 CORS 限制；HTTPS、图片 MIME 类型与大小仍会校验。JSON 响应最大 8 MB，单张在线图片最大 30 MB，请求超时 30 秒。每章最多 3000 页。

## 网站接入边界

添加普通漫画网站的首页网址不会自动解析漫画。网站没有上述 API 时，需要另写站点适配服务，将目录、搜索、详情和章节统一为这里的数据格式；也可以人工维护目录源。无需改动阅读器即可添加符合本协议的新源。当前没有内置可用的第三方在线源。

云环境的网络允许列表与软件漫画源列表是两件事。在云端验证 API 源时，要允许源服务器和图片域名。Windows 本机运行时使用本机网络。

## 存储与下载

漫画源、书架、阅读进度存于系统用户数据目录的 comic-data 下。导入源清单不会写入代码仓库。下载默认存到系统下载目录，可在界面更改。每章单独建文件夹，图片按 0001、0002 等顺序命名，同时生成 chapter.json；同名文件夹自动编号。

可以取消或查看失败原因；已完成的页保留。下载任务列表仅保留当前会话，不支持断点续传。当前还没有应用内本地下载库，已下载文件可通过文件夹查看。单页阅读按左右方向键翻页；条漫模式随滚动记录进度；打开详情后可继续阅读。
