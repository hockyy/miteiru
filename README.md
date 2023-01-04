# Miteiru (見ている)

Miteiru is an open source Electron video player to learn Japanese. It has modular main language dictionary and tokenizer (morphological analyzer), heavily based on External software [MeCab](https://taku910.github.io/mecab/), and optinally needs [JMDict](https://github.com/scriptin/jmdict-simplified) to give language info box. This software is heavily inspired by [Anisubber](https://ookii-tsuki.github.io/Anisubber/). 

## What can 見ている do?

- Cross-platform! Available in MacOS, GNU/Linux.
- Supports all videos that your [chromium](https://www.chromium.org/audio-video/) supports! In some OS's, it supports **x265**.
- On-The-Fly Furigana generation! blazing-fast and no cache build needed.
- Instant definition of any terms that uses LevelDB on first start only!
- Instant definition of any word in the subtitles.
- Translation subtitles alongside the Japanese subtitles.
- Word/Token spacing in the Japanese subtitles 

## Installation Guide

The alpha version will mostly be tested on Darwin/ARM64 M1 Mac. Other build will be made in the future. To directly run the edge version of the app in dev environment, you can run the followings on the cloned repository:

```bash
npm install
npm run dev
```

Mecab can be downloaded through [brew](https://brew.sh/) by running:

```bash
brew install mecab
```

or in Ubuntu:

```bash
sudo apt install mecab
sudo apt install libmecab-dev
```

Then, you can run

```bash
which brew
```

to show your default mecab binary file. Use it as the path when asked in Miteiru. Then, you can get JMDict Dictionary in [https://github.com/scriptin/jmdict-simplified/releases](https://github.com/scriptin/jmdict-simplified/releases). Use it as the path when asked in Miteiru as well. Miteiru will build a LevelDB cache locally. Then, you can enjoy the app!

## Future Enhancements

- Verb inflections 
- Miteiru will be ported to a dedicated media player, like LibVLC or MPV.
- Kanji explanation in the subtitles with animated diagrams.
- Pronounciation audio
- Customizable subtitle style.
- Online hosted videos.
- Will support Android and Windows.
- Miteiru will have built-in Tokenizer and Dictionary, and supports French, German, Bahasa Indonesia, and many more.
- Miteiru will support Chinese and Korean too!

![Miteiru](./README.assets/Miteiru.gif)
