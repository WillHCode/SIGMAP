# SIGMAP

The goal is to build a modern, modular WebGPU-based visualization framework for 2D/3D rendering and compute-powered data representations. SIGMAP provides a core library and framework-specific adapters (React, Vue, Angular), as well as a zero-dependency standalone build for pure TypeScript usage.

---

## Table of Contents

* [Features](#features)  
* [Monorepo Structure](#monorepo-structure)  
* [Getting Started](#getting-started)  
  * [Prerequisites](#prerequisites)  
  * [Installation](#installation)  
  * [Bootstrapping](#bootstrapping)  
* [Building Packages](#building-packages)  
* [Usage Examples](#usage-examples)  
  * [Standalone](#standalone)  
  * [Core API](#core-api)  
  * [React Adapter](#react-adapter)  
  * [Vue Adapter](#vue-adapter)  
  * [Angular Adapter](#angular-adapter)  
* [Contribution Guide](#contribution-guide)  
* [License](#license)  

---
## Work in progress
The video is an early-stage demonstration.
It showcases basic map features to help users navigate. This debug view makes my work easier as I grab OpenStreetMap tiles and rebuild the map "one tile at a time".

[![The video is a demonstration at an early stage of development.](https://img.youtube.com/vi/YiWYCqmcqaw/0.jpg)](https://www.youtube.com/watch?v=YiWYCqmcqaw)

### Current state (from [Branch-6 moving](https://github.com/WillHCode/SIGMAP/tree/6-moving))
Full WebGPU rendering and move handler (Date : 04/11/2025)
[![Full WebGPU rendering and move handler](https://img.youtube.com/vi/WeVFIm1XrBs/0.jpg)](https://www.youtube.com/watch?v=WeVFIm1XrBs)

---

## Features

* **Core WebGPU API**: Lightweight, framework-agnostic core library with full TypeScript support.  
* **Adapters**: Thin, idiomatic bindings for React, Vue 3, and Angular.  
* **Standalone Bundle**: UMD/ESM build for zero-dependency `<script>` inclusion.  
* **Monorepo Management**: Powered by Lerna & npm/Yarn workspaces for synchronized versioning and dependencies.  
* **TypeScript**: Full typings and TS support across all packages.  

---

## Monorepo Structure

```
SIGMAP/
├── lerna.json
├── package.json
├── tsconfig.json           # project references
└── packages/
    ├── core/               # @sigmap/webgpu-core
    ├── standalone/         # @sigmap/webgpu (UMD bundle)
    ├── react/              # @sigmap/webgpu-react (Vite)
    ├── vue/                # @sigmap/webgpu-vue
    └── angular/            # @sigmap/webgpu-angular
```

Each package includes its own `package.json`, `tsconfig.json`, and build config (`rollup.config.js` or `vite.config.ts`).

---

## Getting Started

### Prerequisites

* Node.js 16 or higher  
* npm (>= 8) 

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/sigmap/SIGMAP.git
   cd SIGma
   ```

2. Install dependencies and link packages:

   ```bash
   npx lerna bootstrap
   ```

### Bootstrapping

This step installs all devDependencies and creates symlinks between local packages.

---

## Building Packages

To build all packages in the monorepo:

```bash
npx lerna run build
```

This runs each package’s `build` script (`rollup` for core/vue/angular/standalone, `vite build` for React).

---

## Usage Examples

### Standalone

Include the UMD bundle in your HTML:

```html
<script src="https://unpkg.com/@sigmap/webgpu/dist/webgpu.umd.js"></script>
<script>
  // `WebGPUFramework` is exposed globally by the UMD build
  const app = new WebGPUFramework({ /* options */ });
  app.init();
</script>
```

Or install via npm:

```bash
npm install @sigmap/webgpu
```

### Core API

```ts
import { GPUApp } from '@sigmap/webgpu-core';

const app = new GPUApp({
  canvas: document.getElementById('canvas') as HTMLCanvasElement
});
app.renderHeatmap(data);
```
#### See the folder "sigmap-demo"

### React Adapter

NOT IMPLEMENTED YET

### Vue Adapter

NOT IMPLEMENTED YET

### Angular Adapter

NOT IMPLEMENTED YET

---

## Contribution Guide

Please follow conventional commits and ensure all builds/tests pass in CI.
This project is organised using Github Project (also connect to a Discord bot on a private server) that ease the communication, feedbacks and "Agile" methodology.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.  
