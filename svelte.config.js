import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  // Enable preprocessing for modern features
  preprocess: vitePreprocess(),

  compilerOptions: {
    // Enable Svelte 5 runes
    runes: true,
    // Generate modern JavaScript
    modernAst: true
  }
};
