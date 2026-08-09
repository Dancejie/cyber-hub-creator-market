# 鲲鹏仙域运行时

- 世界：《玄墟八象问命》
- 版本：`story-world-v1.3.1`
- 入口：`viewer/index.html`
- 网页模型：`build/zhouyi-celestial-world-web-meshopt.glb`（24 MiB，Meshopt + WebP）
- 来源工程：`/Users/dangsijie/Documents/元宇宙/zhouyi-model-build-package/dist/zhouyi-web-package`

运行时保持上游的双模式交互：零操作自动导演，以及 WASD、鼠标、踏云飞行、八象结印和对话选择。
主站通过 `WORLD_READY / WORLD_EXIT / WORLD_ERROR` 协议管理 iframe，并在 33 秒入场影片播放时同步预载模型。

## 身份校验

- Meshopt GLB SHA-256: `239275c9d77398c1ee055cbe0c32ab1cfb088c32d860d33df47207fe6a695171`
- Viewer bundle SHA-256: `997a5924bfdb76270808dfe40ee18a6df995a32c8114d7a899119bb1c27cbdcd`
- Landing MP4 SHA-256: `acf26fd5aa812a97e4dfa6c627404ab59f0c8730612f8d375aa01c3c684d79a8`
