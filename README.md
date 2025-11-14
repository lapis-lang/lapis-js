# Lapis JS

An embedded DSL for experimentation of Lapis Semantics

## Installation

The latest version:

```bash
npm install @lapis-lang/lapis-js
```

A specific version:

```bash
npm install @lapis-lang/lapis-js@<version>
```

For direct use in a browser (no build step):

```html
<script type="importmap">
{
  "imports": {
    "@lapis-lang/lapis-js": "https://unpkg.com/@lapis-lang/lapis-js@<version>/dist/index.mjs"
  }
}
</script>
<script type="module">
import { data } from "@lapis-lang/lapis-js";

console.log(typeof data); // "function"
</script>
```

## Usage

For the impatient, here is a quick example of how to use Lapis JS to define an algebraic data type (ADT):

```ts
import { data } from '@lapis-lang/lapis-js';

const Color = data({ Red: {}, Green: {}, Blue: {} });
```
