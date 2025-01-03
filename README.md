# Miteiru (見ている) / zai⁴kan⁴ (在看) / tai²gan² (睇緊)

![Stargazers repo roster for @hocky/miteiru](https://bytecrank.com/nastyox/reporoster/php/stargazersSVG.php?user=hockyy&repo=miteiru)
[![Star History Chart](https://api.star-history.com/svg?repos=hockyy/miteiru&type=Date)](https://star-history.com/#hockyy/miteiru&Date)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-blue.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
![GitHub release](https://img.shields.io/github/release/hockyy/miteiru.svg?color=purple)
![Open Issues](https://img.shields.io/github/issues/hockyy/miteiru?color=green)
![Contributors](https://img.shields.io/github/contributors/hockyy/miteiru)
![Last Commit](https://img.shields.io/github/last-commit/hockyy/miteiru)
![GitHub Stars](https://img.shields.io/github/stars/hockyy/miteiru.svg?color=yellow)
![GitHub Forks](https://img.shields.io/github/forks/hockyy/miteiru.svg)

## Disclaimers
### About the Developer
Hello! I'm **Hocky Yudhiono**, the developer behind **Miteiru**. I created this video player app with the goal of providing a reliable and user-friendly experience for watching your favorite videos.

### Commitment to Security

I am **dedicated to ensuring that Miteiru is secure and free from any malicious components**. However, if you encounter any security issues or vulnerabilities, please reach out to me privately at [miteiru@hocky.id](mailto:miteiru@hocky.id) or just submit a GitHub issue, and I will do my best to address and resolve them promptly.

### Liability Disclaimer
While I strive to maintain a safe and secure application, I cannot be held responsible for any unintended consequences or damages that may occur from using **Miteiru**. **Use the app at your own risk**.

## Download ૮ ˶ᵔ ᵕ ᵔ˶ ა✩°｡ ⋆⸜
<div align="center">

<a href="https://github.com/hockyy/miteiru/releases/latest" target="_blank" rel="noopener noreferrer" style="">
<img width="9%" src="./renderer/public/images/kiwi.png" alt="kiwi"/>
</a>
<a href="https://github.com/hockyy/miteiru/releases/latest" target="_blank" rel="noopener noreferrer" style="">
<img width="60%" src="./renderer/public/images/downloadBanner.gif" alt="banner"/>
</a>
<a href="https://github.com/hockyy/miteiru/releases/latest" target="_blank" rel="noopener noreferrer" style="">
<img width="7%" src="./renderer/public/images/pome.png" alt="pomegranate"/>
</a>
</div>

<table style="border: none;">
  <tr>
    <td><img src="renderer/public/images/logo.png" alt="Miteiru Logo" /></td>
    <td> Miteiru is an open source Electron video player to learn Chinese, Japanese, and Cantonese. It has modular main language dictionary and tokenizer (morphological analyzer), heavily based on External software <a href="https://taku910.github.io/mecab/">MeCab</a>, and optinally needs <a href="https://github.com/scriptin/jmdict-simplified">JMDict</a> to give language info box. This software is heavily inspired by <a href="https://ookii-tsuki.github.io/Anisubber/">Anisubber</a>. </td>
  </tr>
</table>

## What can 見ている do?

- Cross-platform! Available in Windows, MacOS, GNU/Linux.
- Supports all videos that your [chromium](https://www.chromium.org/audio-video/) supports! In some
  OS's, it supports **x265**.
- On-The-Fly Furigana generation! blazing-fast and no severe cache build needed.
- Instant definition of any terms that uses LevelDB on first start only!
- Instant definition of any word in the subtitles.
- Instant definition on Kanji
- Translation subtitles alongside the Japanese subtitles.
- Word/Token spacing in the Japanese subtitles
- Youtube Support

## How to start immersing

- For the first run, you can press this button, and wait for about 2 minutes because it is caching
  the japanese dictionary..
- ![image](https://github.com/hockyy/miteiru/assets/19528709/6d8bcf4f-73dd-4cfb-8a6f-4bbf7e10a25a)
- You can start by dragging:
    - Any videos (Anime is good) you can get subtitle at https://kitsunekko.net/
    - Any youtube URL
        - Or you can just literally paste any youtube watch video into the miteiru (just ctrl + v
          into the player)
        - But youtube japanese will only show for videos that have japanese CC or auto-generated
          japanese CC.
        - Try this:
            - https://www.youtube.com/results?search_query=onomappu
            - https://www.youtube.com/results?search_query=nihongo+no+mori+kenshi+yonezu
            - https://www.youtube.com/@funtv8964
            - https://www.youtube.com/@mm.millmilk
            - ![image](https://github.com/hockyy/miteiru/assets/19528709/b97c3ef1-18ee-40d4-a0ab-ff7d9de81d66)
            - ![image](https://github.com/hockyy/miteiru/assets/19528709/c5e21a69-6cdb-47c9-a842-ad97b81125be)

- Press `X` and `Z` for the configs
- Just read the front page's keyboard shortcut, you can press `Q` to go back to the front page.
- ![image](https://github.com/hockyy/miteiru/assets/19528709/46cd3065-29cf-4d0a-957b-62ef28386693)
- ![image](https://github.com/hockyy/miteiru/assets/19528709/2b54c704-019d-47c1-b183-55ad350c4b18)
- Profit 💰

## For Casual Users: Installation Guide

- Checkout releases here: https://github.com/hockyy/miteiru/releases

### Mac

- Download the .pkg file
- Because I'm too poor to afford the so called 99 USD apple developer program annual fee, you will
  encounter the unidentified developer warning.
    - No worry, all codes are open source and I have no intend to harm your Mac... You can even
      build your own app by following the developer guide below
- Run it this
  way: https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac
- ![image](https://github.com/hockyy/miteiru/assets/19528709/a440a119-49cf-45f1-8c42-93289d20e01e)

### Windows

- Being such a good guy I am, I've provided both the portable one and the setup one, you can just
  pick any, install it.
- There's this issue where some PC would recognize the setup as a virus... but you can try your own
  virus total test.

### Ubuntu

- I made the .deb and .AppImage, currently no other build is provided because I'm too lazy

## How to integrate with Whisper
> As per February 3rd, 2024 [MacWhisper](https://goodsnooze.gumroad.com/l/macwhisper) is a really good UI for Whisper in mac, anyway if you want to run whisper on other OS or for free:

- clone this
  repo [git@github.com:ggerganov/whisper.cpp.git](https://github.com/ggerganov/whisper.cpp)
- install ffmpeg
- `cd whisper.cpp && bash ./models/download-ggml-model.sh large`

put this in your ~/.bashrc or ~/.zshrc or any rc your os use

```  
export WHISPERPATH=~/project/whisper.cpp

whisper() {
  local input="$1"
  shift

  # All remaining arguments will be treated as an array
  local -a extra_args=("$@")
  "$WHISPERPATH/main" -f "$input" -of "$input.w" --model "$WHISPERPATH/models/ggml-medium.bin" -l ja "${extra_args[@]}" -osrt
}

prepwhisper() {
  local input="$1"
  local output="${input%.\*}.wav"
  ffmpeg -i "$input" -ar 16000 -ac 1 -c:a pcm_s16le "$output"
}
```

Then run on your video

```
prepwhisper video.mp4
whisper video.wav
```

- voila

## For Developer: (Own Build) Installation Guide

You can run the followings on the cloned repository: (don't forget to download the LFS files as
well)

```bash
npm install
npm run script:initrepo
npm run dev # This to run dev
npm run build:nsis # This to build for Windows
npm run build:portable # This to build for Windows Portable
npm run build:linux20 # This to build for Linux 20.04
npm run build:linux22 # This to build for Linux 22.04
npm run build # this is for mac
```

## Mecab and Custom Dictionary Setup (Optional)

Mecab can be downloaded through [brew](https://brew.sh/) by running:

```bash
brew install mecab
```

or in Ubuntu:

```bash
sudo apt install mecab
```

Then, you can run

```bash
which mecab
```

or in Windows, you can directly download the binary file
from [SourceForge](https://sourceforge.net/projects/mecab/)

to show your default mecab binary file. Use it as the path when asked in Miteiru. Then, you can get
JMDict Dictionary
in [https://github.com/scriptin/jmdict-simplified/releases](https://github.com/scriptin/jmdict-simplified/releases).
Use it as the path when asked in Miteiru as well. Miteiru will build a LevelDB cache locally. Then,
you can enjoy the app!

## MeCab Dictionary Customization

By default, you are using whatever your default Mecab Dictionary offers you, but you can further
customize this by modifying the `mecabrc` file which is located in `/opt/homebrew/etc/mecabrc` in
MacOS, `C:\Program Files (x86)\MeCab\etc\mecabrc` in Windows, and `/etc/mecabrc` in Ubuntu. For
other OS's you gotta figure it our for yourself right now. Shunou, Miteiru's microlibrary can
support Unidic, Jumandic, Ipadic, and it's variations. Specifically, if you check out the `dicrc`
file of each dictionary, Shunou can support the output format `chamame`, `chasen`, and the classic
Jumandic god knows what output format. You can
get [UniDic files here](https://clrd.ninjal.ac.jp/unidic/en/)

Configuration file in mac:

```
;
; Configuration file of MeCab
;
; $Id: mecabrc.in,v 1.3 2006/05/29 15:36:08 taku-ku Exp $;
;
; dicdir =  /opt/homebrew/lib/mecab/dic/ipadic
; dicdir =  /opt/homebrew/lib/mecab/dic/jumandic
dicdir =  /opt/homebrew/lib/mecab/dic/unidic
; userdic = /home/foo/bar/user.dic

; output-format-type = wakati
; input-buffer-size = 8192

; node-format = %m\n
; bos-format = %S\n
; eos-format = EOS\n
```

Windows:

```
;
; Configuration file of MeCab
;
; $Id: mecabrc.in,v 1.3 2006/05/29 15:36:08 taku-ku Exp $;
;
dicdir =  $(rcpath)\..\dic\unidic

; userdic = /home/foo/bar/user.dic

; output-format-type = wakati
; input-buffer-size = 8192

; node-format = %m\n
; bos-format = %S\n
; eos-format = EOS\n
```

## Future Enhancements

- Verb inflections
- Miteiru will be ported to a dedicated media player, like LibVLC or MPV.
- Kanji explanation in the subtitles with animated diagrams.
- Pronounciation audio
- Customizable subtitle style.
- Online hosted videos.
- Will support Android.
- Miteiru will have built-in Tokenizer and Dictionary, and supports French, German, Bahasa
  Indonesia, and many more.
- Miteiru will support Korean too!

https://user-images.githubusercontent.com/19528709/236619520-076c863a-6c14-4f6e-8f9b-5d1e660fd646.mp4

