const axios = require('axios');
const fs = require('fs');
const path = require('path');

let defaultHeaders = {
  'Wanikani-Revision': '20170710',
  'Authorization': ''
};

const baseUrl = 'https://api.wanikani.com/v2/subjects?types=';

let radicalJson;
let kanjiJson;

async function fetchData(apiUrl, headers) {
  let allData = [];
  let nextPageUrl = apiUrl;
  let pageCount = 0;

  while (nextPageUrl) {
    const response = await axios.get(nextPageUrl, {headers});
    const json = response.data;

    allData.push(...json.data);

    nextPageUrl = json.pages.next_url;
    pageCount += 1;

    console.log(
        `Fetched page ${pageCount}, total items so far: ${allData.length}`);
  }

  return allData;
}

async function downloadImage(url, slug) {
  try {
    const response = await axios.get(url, {responseType: 'arraybuffer'});
    const buffer = Buffer.from(response.data, 'binary');
    fs.writeFileSync(
        path.join(__dirname, `./renderer/public/wanikani/radical/${slug}.png`),
        buffer);
  } catch (error) {
    console.error(`Failed to download image. Error: ${error}`);
  }
}

async function fetchRadicals() {
  try {
    const tmpRes = await fetchData(`${baseUrl}radical`, defaultHeaders);

    for (const radical of tmpRes) {
      const slug = radical.data.slug;
      radicalJson[tmpRes.id] = slug;
      const characterImages = radical.data.characters
          ? radical.data.character_images
          : [];

      let imageFound = false;

      for (const image of characterImages) {
        const {metadata} = image;

        if (
            metadata.color === '#000000' &&
            metadata.dimensions === '128x128' &&
            metadata.style_name === '128px'
        ) {
          imageFound = true;
          const destPath = path.join(
              __dirname,
              `./renderer/public/wanikani/radical/${slug}.png`
          );
          await downloadImage(image.url, destPath);
          break;
        }
      }

      if (!imageFound) {
        if (/\s/.test(slug)) {
          console.warn(`Warning: Slug name contains a space - ${slug}`);
        }
        console.warn(
            `Warning: No image with specified metadata found for radical: ${slug}`
        );
        console.log(JSON.stringify(radical, null, 2));
      }
    }
  } catch (error) {
    console.error(`Failed to fetch radicals. Error: ${error}`);
  }
}

async function fetchKanji() {
  try {
    kanjiJson = await fetchData(`${baseUrl}kanji`, defaultHeaders);
    const resultMap = {};
    kanjiJson.forEach((entry, index) => {
      const character = entry.data.characters;
      resultMap[character] = {
        component_subject_ids: entry.data.component_subject_ids.map(id => {
          return radicalJson[id].slug;
        }),
        meaning_mnemonic: entry.data.meaning_mnemonic
      };

      if (index % 100 === 0) {
        console.log(`Parsed ${index + 1}/${allData.length} kanji`);
      }
    });

    fs.writeFileSync("./renderer/public/wanikani/kanjiMap.json",
        JSON.stringify(resultMap, null, 2));
    console.log(`Parsing complete! Total kanji parsed: ${allData.length}`);
  } catch (error) {
    console.error(`Failed to fetch kanji. Error: ${error}`);
  }
}

async function main() {
  const apiKey = process.argv[2];
  if (!apiKey) {
    console.error("Please provide an API key as an argument.");
    process.exit(1);
  }

  defaultHeaders['Authorization'] = `Bearer ${apiKey}`;

  await fetchRadicals();

  await fetchKanji();
}

main().catch(err => console.error(err));
