# SIGma

A modern, modular WebGPU-based visualization framework for 2D/3D rendering and compute-powered data representations. SIGma provides a core library and framework-specific adapters (React, Vue, Angular), as well as a zero-dependency standalone build for pure TypeScript usage.

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

## Features

* **Core WebGPU API**: Lightweight, framework-agnostic core library with full TypeScript support.  
* **Adapters**: Thin, idiomatic bindings for React, Vue 3, and Angular.  
* **Standalone Bundle**: UMD/ESM build for zero-dependency `<script>` inclusion.  
* **Monorepo Management**: Powered by Lerna & npm/Yarn workspaces for synchronized versioning and dependencies.  
* **TypeScript**: Full typings and TS support across all packages.  

---

## Monorepo Structure

```
SIGma/
├── lerna.json
├── package.json
├── tsconfig.json           # project references
└── packages/
    ├── core/               # @sigma/webgpu-core
    ├── standalone/         # @sigma/webgpu (UMD bundle)
    ├── react/              # @sigma/webgpu-react (Vite)
    ├── vue/                # @sigma/webgpu-vue
    └── angular/            # @sigma/webgpu-angular
```

Each package includes its own `package.json`, `tsconfig.json`, and build config (`rollup.config.js` or `vite.config.ts`).

---

## Getting Started

### Prerequisites

* Node.js 16 or higher  
* npm (>= 8) or Yarn classic  
* Git  

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/sigma/SIGma.git
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
<script src="https://unpkg.com/@sigma/webgpu/dist/webgpu.umd.js"></script>
<script>
  // `WebGPUFramework` is exposed globally by the UMD build
  const app = new WebGPUFramework({ /* options */ });
  app.init();
</script>
```

Or install via npm:

```bash
npm install @sigma/webgpu
```

### Core API

```ts
import { GPUApp } from '@sigma/webgpu-core';

const app = new GPUApp({
  canvas: document.getElementById('canvas') as HTMLCanvasElement
});
app.renderHeatmap(data);
```

### React Adapter

```bash
npm install @sigma/webgpu-react react react-dom
```

```tsx
import React from 'react';
import { WebGPUCanvas } from '@sigma/webgpu-react';

export function App() {
  return <WebGPUCanvas options={{ /* ... */ }} />;
}
```

### Vue Adapter

```bash
npm install @sigma/webgpu-vue vue
```

```vue
<template>
  <WebGPUCanvas :options="options" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { WebGPUCanvas } from '@sigma/webgpu-vue';

export default defineComponent({
  components: { WebGPUCanvas },
  setup() {
    const options = { /* ... */ };
    return { options };
  }
});
</script>
```

### Angular Adapter

```bash
npm install @sigma/webgpu-angular @angular/core
```

```ts
import { Component } from '@angular/core';
import { WebGPUComponent } from '@sigma/webgpu-angular';

@Component({
  selector: 'app-root',
  template: '<webgpu-canvas [options]="options"></webgpu-canvas>'
})
export class AppComponent {
  options = { /* ... */ };
}
```

---

## Contribution Guide

1. Fork the repo  
2. Create a feature branch (`git checkout -b feature/xyz`)  
3. Commit your changes (`git commit -m 'feat: add xyz'`)  
4. Push to your branch (`git push origin feature/xyz`)  
5. Open a Pull Request  

Please follow conventional commits and ensure all builds/tests pass in CI.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.  
