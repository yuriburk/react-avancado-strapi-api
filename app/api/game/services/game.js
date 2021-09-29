"use strict";

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-services)
 * to customize this service
 */

const axios = require("axios");
const slugify = require("slugify");
const qs = require("qs");

async function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function Exception(error) {
  return {
    error,
    data: error.data && error.data.errors && error.data.errors,
  };
}

async function getByName(name, entityName) {
  try {
    const item = await strapi.services[entityName].find({ name });
    return item.length ? item[0] : null;
  } catch (error) {
    console.log("getByName", Exception(error));
  }
}

async function create(name, entityName) {
  try {
    const item = await getByName(name, entityName);

    if (!item) {
      await strapi.services[entityName].create({
        name,
        slug: slugify(name, { lower: true }),
      });
    }
  } catch (error) {
    console.log("create", Exception(error));
  }
}

async function getGameInfo(slug) {
  try {
    const jsdom = require("jsdom");
    const { JSDOM } = jsdom;

    const body = await axios.get(`https://www.gog.com/game/${slug}`);
    const dom = new JSDOM(body.data);

    const ratingValue =
      dom.window.document.querySelector(".age-restrictions__icon > use")
        ?.attributes[0].nodeValue ?? "BR0";
    const rating = ratingValue
      ? ratingValue.replace("#", "").replace("_", "")
      : rating;
    const description = dom.window.document.querySelector(".description");

    return {
      rating,
      short_description: description.textContent.slice(0, 160),
      description: description.innerHTML,
    };
  } catch (error) {
    console.log("getGameInfo", Exception(error));
  }
}

async function createManyToManyData(products) {
  try {
    const developers = {};
    const publishers = {};
    const categories = {};
    const platforms = {};

    products.forEach((product) => {
      const { developer, publisher, genres, supportedOperatingSystems } =
        product;

      genres &&
        genres.forEach((item) => {
          categories[item] = true;
        });
      supportedOperatingSystems &&
        supportedOperatingSystems.forEach((item) => {
          platforms[item] = true;
        });
      developers[developer] = true;
      publishers[publisher] = true;
    });

    return Promise.all([
      ...Object.keys(developers).map((name) => create(name, "developer")),
      ...Object.keys(publishers).map((name) => create(name, "publisher")),
      ...Object.keys(categories).map((name) => create(name, "category")),
      ...Object.keys(platforms).map((name) => create(name, "platform")),
    ]);
  } catch (error) {
    console.log("createManyToManyData", Exception(error));
  }
}

async function createGames(products) {
  try {
    for (const product of products) {
      const item = await getByName(product.title, "game");

      if (!item) {
        console.info(`Creating ${product.title}`);
        const game = await strapi.services.game.create({
          name: product.title,
          slug: product.slug.replace("_", "-"),
          price: product.price.amount,
          release_date: new Date(
            Number(product.globalReleaseDate) * 1000
          ).toISOString(),
          categories: await Promise.all(
            product.genres.map((name) => getByName(name, "category"))
          ),
          platforms: await Promise.all(
            product.supportedOperatingSystems.map((name) =>
              getByName(name, "platform")
            )
          ),
          developers: [await getByName(product.developer, "developer")],
          publisher: await getByName(product.publisher, "publisher"),
          ...(await getGameInfo(product.slug)),
        });

        await setImage({ image: product.image, game, filename: game.slug });

        for (const image of product.gallery.slice(0, 2)) {
          await setImage({
            image,
            game,
            filename: `${game.slug}-${product.gallery.indexOf(image)}`,
            field: "gallery",
          });
          await timeout(200);
        }
      }
    }
  } catch (error) {
    console.log("createGames", Exception(error));
  }
}

async function setImage({ image, game, filename, field = "cover" }) {
  const url = `https:${image}_bg_crop_1680x655.jpg`;
  const { data } = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(data, "base64");

  const FormData = require("form-data");
  const formData = new FormData();

  formData.append("refId", game.id);
  formData.append("ref", "game");
  formData.append("field", field);
  formData.append("files", buffer, { filename: `${filename}.jpg` });

  console.info(`Uploading ${field} image ${filename}.jpg`);

  await axios.post(
    `http://${strapi.config.host}:${strapi.config.port}/upload`,
    formData,
    {
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
      },
    }
  );
}

module.exports = {
  populate: async (query) => {
    const gogApiUrl = `https://www.gog.com/games/ajax/filtered?${qs.stringify(
      query
    )}`;

    const {
      data: { products },
    } = await axios.get(gogApiUrl);

    await createManyToManyData(products);

    await createGames(products);
  },
};
