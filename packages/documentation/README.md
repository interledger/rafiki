# Rafiki documentation

This repo is the code behind [rafiki.dev](https://rafiki.dev), our documentation website for Rafiki.

## Contribute

This website is built with [Starlight](https://starlight.astro.build/), a documentation framework based on [Astro](https://astro.build/).

### Local Development

- Make sure all the dependencies for the website are installed. Because this is a monorepo, you should run the following command in the root of the project folder:

```sh
$ pnpm i
```

- Run the dev server from the `/packages/documentation` folder:

```sh
$ pnpm start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

- Build the site, again, this must be run from the `/packages/documentation` folder:

```sh
$ pnpm build:docs
```

This command generates static content into the build directory and can be served using any static contents hosting service.

## Editing Content

Starlight looks for `.md` or `.mdx` files in the `src/content/docs/` directory. Each file is exposed as a route based on its file name. Due to the nature of how Starlight deals with content and their generated URLs, all docs content lives in `/src/content/docs/`. For example, the home page of the documentation lives within the `/src/content/docs/` folder and is rendered at rafiki.dev, not rafiki.dev/docs.

Static assets, like favicons or images, can be placed in the `public/` directory. When referencing these assets in your markdown, you do not have to include `public/` in the file path, so an image would have a path like:

```md
![A lovely description of your beautiful image](/img/YOUR_BEAUTIFUL_IMAGE.png)
```

### Editing an existing docs page

Edit docs by navigating to `/src/content/docs` and editing the corresponding document:

`/src/content/docs/RELEVANT_FOLDER/doc-to-be-edited.md`

```markdown
---
title: This Doc Needs To Be Edited
---

Edit me...
```

Refer to the Starlight documentation on [authoring content](https://starlight.astro.build/guides/authoring-content/) for more detailed guidance.

### Docs components

We have extracted some commonly repeated patterns within the documentation pages into custom docs components that can be reused. There are components which are shared across all our Starlight documentation sites and those which are specific to this project only. This will determine what the import path is.

- Hidden (Shared)
- LargeImg (Shared)
- LinkOut (Shared)
- MermaidWrapper (Shared)
- StylishHeader (Shared)
- Tooltip (Shared)

For the shared components, if you are using both `LinkOut` and `MermaidWrapper` on the same page, you can import them both like so:

```jsx
import { LinkOut, MermaidWrapper } from '@interledger/docs-design-system'
```

For more information about importing things in Javascript, please refer to [import on MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import).

The available shared components are documented at our [documentation style guide](https://interledger.tech).

## Adding Content

### Adding a new docs page to an existing sidebar

1. Create the doc as a new markdown file in `/src/content/docs/RELEVANT_FOLDER`, example
   `/src/content/docs/RELEVANT_FOLDER/newly-created-doc.md`:

```md
---
title: This Doc Needs To Be Written
---

My new content here..
```

The sidebar of the documentation site is configured in the `astro.config.mjs`. Refer to the Starlight documentation on [sidebar configuration](https://starlight.astro.build/reference/configuration/#sidebar/) for more detailed guidance.

### Adding custom pages

Astro is a content-focused web framework that integrates with a lot of existing framework libraries, making it relatively flexible for building customised sites.

Pages exist in the `/src/pages` directory, and out-of-the-box come with absolutely nothing. For the web monetization website, we have created custom layout components that form the frame of a basic HTML web page, and allow you to add content that would populate the `main` element of the page via a concept known as [slots](https://docs.astro.build/en/core-concepts/astro-components/#slots). A `<slot />` allows you to specify where individual page content should be injected.

```
---
import i18next, { t, changeLanguage } from "i18next";
import Base from '../layouts/Base.astro';
---
<Base>
  /* Page content goes here */
</Base>

```

Refer to the Astro documentation on [pages](https://docs.astro.build/en/core-concepts/astro-pages/) for more detailed guidance.
