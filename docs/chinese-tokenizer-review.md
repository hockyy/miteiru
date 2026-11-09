# Reviewed Chinese tokenizer differences

These are implementation-agent judgments with both candidates visible. They are **not blind, independent, human-validated or a substitute for gold scoring**. The policy is [the frozen learner-click guidelines](../tests/fixtures/tokenizer-eval/GUIDELINES.md). An incorrect phrase/particle merge counts as worse even when the surface has a dictionary entry. Mixed improvements/regressions can be neutral and are identified explicitly.

The sampler considers only authored lines whose token arrays differ, preserves their corpus order, and chooses row `floor(i × N / k)` for each `i = 0..k-1`. Full comparison takes 20 simplified + 20 traditional Mandarin and 40 Cantonese lines; overlay comparison takes 15 + 15 Mandarin and 30 Cantonese. Traditional sentences are conversions of the same Mandarin corpus, so these are not independent script samples. Compact deltas below omit unchanged prefixes/suffixes; the six `review-*.jsonl` files retain full text, full token arrays, judgments and reasons.

| Comparison | Language | Better | Worse | Neutral |
| --- | --- | ---: | ---: | ---: |
| jieba HMM → native + app | Mandarin | 37 | 2 | 1 |
| jieba HMM → native + app | yue | 35 | 4 | 1 |
| native base → app | Mandarin | 21 | 6 | 3 |
| native base → app | yue | 15 | 11 | 4 |

**Acceptance is not met:** full-comparison worse shares are 5% Mandarin and 10% Cantonese; overlay-only shares are 20% and 36.7%. This targeted changed-line sample is not an estimate of overall sentence error rate, but the wrong-sense and productive-phrase failures are real. Model parameters remain frozen after held-out scoring. This is a draft for review, not a claim of near-zero regressions.

## jieba HMM → native + app, zh-Hans

| ID | Sentence | Before → after (changed span) | Judgment | Reason |
| --- | --- | --- | --- | --- |
| 1 | 我想在地铁站附近买一杯冰咖啡。 | 一杯 / 冰 / 咖啡 → 一 / 杯 / 冰咖啡 | better | Separates numeral/counter and restores the iced-coffee headword. |
| 25 | 他说自己从来没去过上海。 | 去过 → 去 / 过 | better | Separates experiential aspect from the verb. |
| 60 | 请把空调温度调到26度。 | 调到 → 调 / 到 | better | Separates the unindexed compositional verb/result. |
| 81 | 日志显示服务器在凌晨三点重启。 | 三点 → 三 / 点 | better | Separates the hour numeral and unit. |
| 121 | 你尝尝这个汤够不够咸。 | 这个 / 汤 / 够不够 → 这 / 个 / 汤 / 够 / 不够 | better | Separates demonstrative/counter and partly repairs A-not-A; 不够 remains joined. |
| 154 | 路口的摄像头应该拍到了。 | 拍到 → 拍 / 到 | better | Separates the unindexed compositional resultative. |
| 187 | 我们是不是已经坐过站了？ | 是不是 / 已经 / 坐过 → 是 / 不 / 是 / 已经 / 坐 / 过 | better | Separates A-not-A and experiential aspect. |
| 207 | 浴室的热水怎么一直不热？ | 不热 → 不 / 热 | better | Separates compositional negation and adjective. |
| 228 | 这个地方的名字很容易念错。 | 这个 → 这 / 个 | better | Separates demonstrative and classifier. |
| 251 | 分组讨论的时候每个人都要发言。 | 每个 → 每 / 个 | better | Separates distributive and classifier. |
| 270 | 这句话里的数字要读成几声？ | 这句 / 话 / 里 / 的 / 数字 / 要 / 读成 / 几声 → 这 / 句 / 话 / 里 / 的 / 数字 / 要 / 读 / 成 / 几 / 声 | better | Repairs classifier, resultative and numeral-unit boundaries. |
| 284 | 镜头切换太快，我没看清发生了什么。 | 太快 → 太 / 快 | better | Separates degree adverb and adjective. |
| 313 | 这个移动硬盘有时候识别不出来。 | 这个 → 这 / 个 | better | Separates demonstrative and classifier. |
| 337 | 这不是你的操作问题，是系统出错了。 | 不是 → 不 / 是 | better | Separates copular negation. |
| 362 | 会议纪要里写的不是我的原话。 | 不是 → 不 / 是 | better | Separates copular negation. |
| 384 | 有些事情不是努力就一定能做到的。 | 不是 → 不 / 是 | better | Separates copular negation. |
| 418 | 她还是和以前一样爱笑。 | 爱笑 → 爱 / 笑 | better | Separates the transparent liking-plus-verb phrase. |
| 440 | 医生说最近要少熬夜。 | 要少 → 要 / 少 | better | Repairs the modal-plus-degree crossing. |
| 465 | 这个GitHub项目昨天刚发布v2.0。 | 这个 → 这 / 个 | better | Separates demonstrative and classifier. |
| 481 | 他的网名是@NightFox，不是真名。 | @ / NightFox / ， / 不是 → @NightFox / ， / 不 / 是 | better | Keeps the handle intact and separates copular negation. |

## jieba HMM → native + app, zh-Hant

| ID | Sentence | Before → after (changed span) | Judgment | Reason |
| --- | --- | --- | --- | --- |
| 1 | 我想在地鐵站附近買一杯冰咖啡。 | 一杯 / 冰 / 咖啡 → 一 / 杯 / 冰咖啡 | better | Separates numeral/counter and restores the iced-coffee headword. |
| 25 | 他說自己從來沒去過上海。 | 去過 → 去 / 過 | better | Separates experiential aspect. |
| 61 | 這個App更新以後好用多了。 | 這個 → 這 / 個 | better | Separates demonstrative and classifier. |
| 90 | 這段對話聽起來有點奇怪。 | 聽 / 起來 → 聽起來 | better | Restores the contextual dictionary unit 聽起來. |
| 122 | 鍋裏的水開了，快把火關小。 | 水開 / 了 / ， / 快 / 把 / 火關 → 水 / 開 / 了 / ， / 快 / 把 / 火 / 關 | better | Removes cross-boundary HMM joins around water boiling and turning down heat. |
| 156 | 紅燈還沒變，先別過馬路。 | 過 / 馬路 → 過馬路 | neutral | The indexed street-crossing phrase is useful, but verb/object splitting is also defensible. |
| 187 | 我們是不是已經坐過站了？ | 是不是 / 已經 / 坐過 → 是 / 不 / 是 / 已經 / 坐 / 過 | better | Separates A-not-A and experiential aspect. |
| 209 | 樓上太吵，能換一個房間嗎？ | 太吵 / ， / 能換 / 一個 → 太 / 吵 / ， / 能 / 換 / 一 / 個 | better | Separates degree, modal and count phrases. |
| 228 | 這個地方的名字很容易唸錯。 | 這個 → 這 / 個 | better | Separates demonstrative and classifier. |
| 251 | 分組討論的時候每個人都要發言。 | 每個 → 每 / 個 | better | Separates distributive and classifier. |
| 271 | 兒化音在字幕裏沒有寫出來。 | 兒化 / 音在 → 兒化音 / 在 | better | Restores the rhoticization term and removes the noun/preposition crossing. |
| 287 | 我不喜歡這個角色，但很佩服演員。 | 這個 → 這 / 個 | better | Separates demonstrative and classifier. |
| 310 | 這個文件夾裏面有兩個同名文件。 | 這個 / 文件夾 / 裏面 / 有 / 兩個 → 這 / 個 / 文件夾 / 裏面 / 有 / 兩 / 個 | better | Separates demonstrative and numeral/counter. |
| 332 | 我想知道最近三個月的變化。 | 三個 → 三 / 個 | better | Separates numeral and classifier. |
| 360 | 這個需求需要再和用戶確認一下。 | 這個 → 這 / 個 | better | Separates demonstrative and classifier. |
| 382 | 這不是考試，沒有標準答案。 | 這 / 不是 → 這不 / 是 | worse | 這不 has a discourse sense; here it crosses the subject/copular-negation boundary. |
| 409 | 那時候你還沒有出生呢。 | 你還 → 你 / 還 | better | Removes the pronoun/adverb crossing. |
| 439 | 花粉過敏的時候眼睛特別癢。 | 花粉 / 過敏 → 花粉過敏 | better | The hay-fever compound matches its dictionary sense. |
| 462 | 這場演唱會的歌單我都會唱。 | 都 / 會 → 都會 | worse | 都會 means metropolis in the dictionary; here 都 and modal 會 must be separate. |
| 481 | 他的網名是@NightFox，不是真名。 | @ / NightFox / ， / 不是 → @NightFox / ， / 不 / 是 | better | Keeps the handle intact and separates copular negation. |

## jieba HMM → native + app, yue

| ID | Sentence | Before → after (changed span) | Judgment | Reason |
| --- | --- | --- | --- | --- |
| 1 | 我想喺地鐵站附近買杯凍啡。 | 買杯 → 買 / 杯 | better | Separates buying and its classifier. |
| 12 | 我唔係唔想去，係冇時間啫。 | 唔係 → 唔 / 係 | better | Separates compositional copular negation. |
| 22 | 嗰間餐廳嘅麻婆豆腐幾好食。 | 麻 / 婆 / 豆腐 → 麻婆豆腐 | better | Restores the mapo-tofu headword. |
| 35 | 多謝你一直幫住我。 | 幫住 → 幫 / 住 | better | Separates the verb and durative complement. |
| 50 | 我訂咗個靠窗嘅位。 | 我訂 → 我 / 訂 | better | Removes the pronoun/verb HMM crossing. |
| 66 | 條片把聲同字幕對唔埋。 | 條片 / 把 / 聲同 → 條 / 片 / 把 / 聲 / 同 | better | Separates classifiers, nouns and conjunction. |
| 77 | 做自然語言處理要睇上文下理。 | 自然 / 語言 → 自然語言 | better | Restores the natural-language technical unit. |
| 89 | 佢哋兩個識咗十幾年。 | 兩個識 / 咗 / 十幾年 → 兩 / 個 / 識 / 咗 / 十幾 / 年 | better | Separates numeral/counter, aspect and year unit. |
| 100 | 記得睇清楚啲改動save晒未。 | 睇 / 清楚 → 睇清楚 | better | The indexed see-clearly resultative is useful in context. |
| 113 | 我發咗個好奇怪嘅夢。 | 我發 → 我 / 發 | better | Removes the pronoun/verb crossing. |
| 123 | 薯仔切細件啲會易熟啲。 | 切細件 / 啲 / 會易 → 切 / 細 / 件 / 啲 / 會 / 易 | better | Removes count and modal/adjective HMM joins. |
| 139 | 呢層係賣童裝嘅。 | 賣童 / 裝 → 賣 / 童裝 | better | Restores children's clothing without absorbing the verb. |
| 149 | 唔該講吓個銀包係咩色。 | 講吓 / 個 / 銀包 / 係咩 → 講 / 吓 / 個 / 銀包 / 係 / 咩 | better | Separates the verbal particle and copula/question word. |
| 162 | 我暈車浪，可唔可以開少少窗？ | 我暈 / 車浪 → 我 / 暈車浪 | better | Restores motion sickness and removes the pronoun crossing. |
| 175 | 尾班車仲有三分鐘入站。 | 尾班 / 車 / 仲有 / 三 / 分鐘 / 入站 → 尾班車 / 仲 / 有 / 三 / 分鐘 / 入 / 站 | better | Restores last train and separates compositional 仲有; 入站 remains split. |
| 185 | 戴咗耳機就聽唔到廣播喇。 | 唔到 → 唔 / 到 | better | Separates inserted negation from the potential complement. |
| 203 | 前台話而家仲未有得check-in。 | 仲未 / 有得 / check / - / in → 仲 / 未 / 有得 / check-in | better | Keeps check-in intact and separates compositional adverbs. |
| 215 | 景區入面啲小路唔可以亂行。 | 景區 / 入面 / 啲 / 小路 / 唔 / 可以 / 亂行 → 景 / 區 / 入面 / 啲 / 小路 / 唔 / 可以 / 亂 / 行 | worse | Fragments the established scenic-area noun 景區, although absent from this CantoDict. |
| 227 | 我淨係識前面嗰兩個字。 | 個 / 字 → 個字 | worse | 個字 means five minutes in CantoDict; here it is classifier plus character. |
| 239 | 緊急聯絡人唔可以填自己個電話。 | 聯絡 / 人 → 聯絡人 | better | Restores contact person. |
| 252 | 佢讀得好清楚，我聽得明。 | 得明 → 得 / 明 | better | Separates the inserted potential marker. |
| 266 | 呢個生字我尋日已經save咗。 | 呢個 / 生字 → 呢 / 個 / 生 / 字 | worse | Fragments indexed 生字 in its new-vocabulary sense. |
| 276 | 片尾歌開始喇，後面仲有冇彩蛋？ | 仲有 / 冇 → 仲 / 有冇 | better | Separates 仲 and keeps the indexed existential question 有冇. |
| 286 | 呢句係咪暗示緊上一集件事？ | 緊上 / 一集件 → 緊 / 上 / 一 / 集 / 件 | better | Removes aspect/count/noun crossings. |
| 300 | 呢個account突然開始出埋啲怪廣告。 | 呢個 → 呢 / 個 | better | Separates demonstrative and classifier. |
| 313 | 呢個外置硬碟有時認唔到。 | 呢個 / 外置 / 硬 / 碟 / 有時 / 認 / 唔到 → 呢 / 個 / 外 / 置 / 硬碟 / 有時 / 認 / 唔 / 到 | neutral | Repairs hard disk and negation, but fragments the established modifier 外置. |
| 324 | 部printer卡咗紙，唔好硬扯。 | 硬扯 → 硬 / 扯 | better | Separates the compositional force-plus-pull phrase. |
| 337 | 唔關你事，係個系統出錯。 | 唔關你事 → 唔 / 關 / 你 / 事 | worse | Loses the indexed none-of-your-fault/business conversational expression. |
| 350 | 呢個版面可唔可以淨用keyboard？ | 呢個 / 版面 / 可 / 唔 / 可以 / 淨用 → 呢 / 個 / 版面 / 可 / 唔 / 可以 / 淨 / 用 | better | Separates demonstrative/counter and the only-use phrase. |
| 361 | 我哋下星期一再開個會。 | 開個 → 開 / 個 | better | Separates opening/holding and the classifier. |
| 374 | 呢個數高過舊年同期12%。 | 呢個 / 數高過 → 呢 / 個 / 數 / 高 / 過 | better | Separates the count and comparative construction. |
| 384 | 有啲嘢唔係努力就一定做到㗎。 | 唔係 → 唔 / 係 | better | Separates copular negation. |
| 402 | 細個覺得好遠，而家行兩步就到。 | 好遠 / ， / 而家 / 行兩步 → 好 / 遠 / ， / 而家 / 行 / 兩 / 步 | better | Separates degree/adjective and numeral/unit. |
| 416 | 同學聚會定咗下個月十五號。 | 十五號 → 十五 / 號 | better | Separates the date numeral and day unit. |
| 428 | 條街浸到腳眼咁高。 | 條街 / 浸到 → 條 / 街 / 浸 / 到 | better | Separates street classifier and resultative. |
| 439 | 花粉過敏嗰陣對眼好痕。 | 花粉 / 過敏 / 嗰陣 / 對眼 / 好痕 → 花粉過敏 / 嗰陣 / 對眼 / 好 / 痕 | better | Restores hay fever and separates degree/adjective. |
| 451 | 抖兩日先繼續，唔好死頂。 | 兩日 → 兩 / 日 | better | Separates duration numeral and day unit. |
| 467 | 條USB-C轉HDMI線擺咗喺邊？ | USB / - / C → USB-C | better | Keeps the USB-C technical label intact. |
| 478 | 呢個模型係3D打印出嚟㗎。 | 呢個 → 呢 / 個 | better | Separates demonstrative and classifier. |
| 490 | 今日星期五，唔係星期四。 | 唔係 → 唔 / 係 | better | Separates copular negation. |

## native base → app, zh-Hans

| ID | Sentence | Before → after (changed span) | Judgment | Reason |
| --- | --- | --- | --- | --- |
| 1 | 我想在地铁站附近买一杯冰咖啡。 | 冰 / 咖啡 → 冰咖啡 | better | Restores iced coffee. |
| 35 | 谢谢你一直以来的帮助。 | 一直 / 以来 → 一直以来 | better | Restores the fixed temporal expression. |
| 70 | 我们不要剧透，好不好？ | 剧 / 透 → 剧透 | better | Restores the spoiler verb. |
| 79 | 这家初创公司正在开发开源软件。 | 初创 / 公司 / 正在 / 开发 / 开源 / 软件 → 初创公司 / 正在 / 开发 / 开源软件 | better | Restores the startup-company and open-source-software terms. |
| 90 | 这段对话听起来有点奇怪。 | 听 / 起来 → 听起来 | better | Restores the contextual sound-like unit. |
| 106 | 你怎么穿着拖鞋就跑出来了？ | 穿 / 着 → 穿着 | worse | The restored 穿着 headword means attire; here 着 is aspect after wear. |
| 156 | 红灯还没变，先别过马路。 | 过 / 马路 → 过马路 | neutral | Indexed street-crossing phrase versus transparent verb/object convention. |
| 185 | 耳机戴上以后就听不到广播了。 | 戴 / 上 → 戴上 | better | Restores the indexed put-on resultative. |
| 199 | 下飞机以后先去取行李。 | 下 / 飞机 → 下飞机 | neutral | Indexed deplaning phrase versus transparent verb/object convention. |
| 212 | 押金什么时候退回银行卡？ | 什么 / 时候 → 什么时候 | better | Restores the lexical when-question. |
| 221 | 这张合照里少了一个人。 | 一 / 个 / 人 → 一个人 | worse | 一个人 is indexed as alone; this line counts one missing person. |
| 299 | 我想把这个陌生号码拉黑。 | 拉 / 黑 → 拉黑 | better | Restores the blacklist verb. |
| 396 | 这条路很难走，可是风景很好。 | 难 / 走 → 难走 | better | The indexed hard-to-travel adjective fits the road context. |
| 433 | 我把手套放在另一件外套里了。 | 另 / 一 → 另一 | better | Restores the indexed another determiner. |
| 460 | 出口太挤，我们等一会儿再走。 | 等 / 一会儿 → 等一会儿 | worse | Absorbs the waiting verb into the following duration phrase. |

## native base → app, zh-Hant

| ID | Sentence | Before → after (changed span) | Judgment | Reason |
| --- | --- | --- | --- | --- |
| 1 | 我想在地鐵站附近買一杯冰咖啡。 | 冰 / 咖啡 → 冰咖啡 | better | Restores iced coffee. |
| 35 | 謝謝你一直以來的幫助。 | 一直 / 以來 → 一直以來 | better | Restores the fixed temporal expression. |
| 70 | 我們不要劇透，好不好？ | 劇 / 透 → 劇透 | better | Restores the spoiler verb. |
| 80 | 產品經理和工程師正在討論需求。 | 產品 / 經理 → 產品經理 | better | Restores the product-manager job title. |
| 94 | 這個表情包太好笑了😂。 | 表情 / 包 → 表情包 | better | Restores the meme term. |
| 131 | 我只帶了現金，不能掃碼。 | 掃 / 碼 → 掃碼 | better | Restores scan-code. |
| 156 | 紅燈還沒變，先別過馬路。 | 過 / 馬路 → 過馬路 | neutral | Indexed street-crossing phrase versus transparent verb/object convention. |
| 193 | 登機箱不能超過七公斤。 | 超 / 過 → 超過 | better | Restores the lexical exceed verb. |
| 200 | 行李轉盤上的箱子都長得差不多。 | 長 / 得 → 長得 | better | The dictionary look/appearance sense fits 長得差不多. |
| 220 | 把人像模式關掉會清楚一點。 | 人 / 像 → 人像 | better | Restores portrait. |
| 280 | 字幕組把這個笑話翻譯得很巧妙。 | 得 / 很 → 得很 | worse | Glues grammatical 得 to its following degree expression. |
| 323 | 打印之前先檢查一下頁邊距。 | 頁 / 邊 → 頁邊 | better | Recovers the margin component; the larger margin-distance term remains fragmented. |
| 382 | 這不是考試，沒有標準答案。 | 這 / 不 → 這不 | worse | Introduces the wrong discourse-sense 這不 across a copular-negation boundary. |
| 433 | 我把手套放在另一件外套裏了。 | 另 / 一 → 另一 | better | Restores the indexed another determiner. |
| 460 | 出口太擠，我們等一會兒再走。 | 等 / 一會兒 → 等一會兒 | worse | Absorbs the waiting verb into the following duration phrase. |

## native base → app, yue

| ID | Sentence | Before → after (changed span) | Judgment | Reason |
| --- | --- | --- | --- | --- |
| 1 | 我想喺地鐵站附近買杯凍啡。 | 凍 / 啡 → 凍啡 | better | Restores iced coffee. |
| 39 | 唔該用廣東話講多次。 | 多 / 次 → 多次 | worse | 講多次 means say it once more here, not the dictionary many-times sense. |
| 48 | 班機因為大霧遲咗兩個鐘。 | 大 / 霧 → 大霧 | better | Restores heavy fog. |
| 67 | 停一停先，我想查呢個字。 | 個 / 字 → 個字 | worse | 個字 is five minutes in the dictionary, not classifier plus character here. |
| 76 | 我對中國歷史幾有興趣。 | 中國 / 歷史 → 中國歷史 | neutral | An indexed school-subject term; compositional Chinese/history is also defensible. |
| 83 | 我搞咗兩日先整返好。 | 整 / 返 → 整返 | better | Restores the indexed fix resultative. |
| 103 | 今日邊個負責熄燈鎖門呀？ | 熄 / 燈 / 鎖 / 門 → 熄燈 / 鎖門 | better | Restores switch-off-lights and lock-door units. |
| 133 | 呢張優惠券聽日先用得。 | 優惠 / 券 → 優惠券 | better | Restores coupon. |
| 144 | 呢對鞋刮腳，我想退貨。 | 刮 / 腳 / ， / 我 / 想 / 退 / 貨 → 刮腳 / ， / 我 / 想 / 退貨 | better | Restores rubbing-shoes and return-goods units. |
| 162 | 我暈車浪，可唔可以開少少窗？ | 暈 / 車 / 浪 → 暈車浪 | better | Restores motion sickness. |
| 171 | 你行先，我返架車拎嘢。 | 行 / 先 → 行先 | neutral | Indexed go-first expression versus productive verb/final 先. |
| 176 | 唔好挨住月台幕門。 | 月台 / 幕門 → 月台幕門 | better | Restores platform screen door. |
| 205 | 房入面有風筒同電熱水煲。 | 有 / 風 / 筒 / 同 / 電 / 熱 / 水 → 有風 / 筒 / 同 / 電 / 熱水 | worse | 有風 means windy; here 有 precedes 風筒, producing a cross-boundary merge. |
| 219 | 你隻手指遮住咗個鏡頭。 | 遮 / 住 → 遮住 | better | The indexed cover/obstruct resultative fits the hand blocking the lens. |
| 228 | 呢度個地名好容易讀錯。 | 好 / 容易 / 讀 / 錯 → 好容易 / 讀錯 | worse | 好容易 is indexed ironically as with difficulty, not the literal degree phrase here; 讀錯 improves. |
| 244 | 個答案唔一定得一種寫法。 | 一 / 種 → 一種 | worse | Glues numeral and classifier in 一種. |
| 253 | 呢個字喺度唔係平時嗰個意思。 | 個 / 字 → 個字 | worse | 個字 is the wrong five-minutes sense. |
| 267 | 我個詞典仲未有呢個講法。 | 未 / 有 → 未有 | worse | 未有 glues not-yet and existence in a transparent negative clause. |
| 281 | 我睇到呢度真係喊咗出嚟。 | 睇 / 到 → 睇到 | better | Restores the indexed see resultative. |
| 301 | login嗰陣要再驗證多次。 | 多 / 次 → 多次 | worse | Here 多次 is one more verification, not many times. |
| 317 | 個雲端硬碟就滿，清一清先啦。 | 硬 / 碟 → 硬碟 | better | Restores hard disk. |
| 332 | 我想睇最近三個月點變。 | 三 / 個月 → 三個月 | worse | Glues a productive three-month numeral/counter phrase. |
| 356 | 個提示框太長，我冇睇晒。 | 太 / 長 → 太長 | worse | Glues the degree adverb and adjective; the indexed oversize sense is not needed. |
| 368 | 你個建議好有用，多謝晒。 | 多謝 / 晒 → 多謝晒 | better | Restores the conventional thank-you-very-much formula. |
| 378 | 搞清楚啲事實先，再講原因。 | 再 / 講 → 再講 | worse | Here 再 means then/before explaining the cause, not the indexed repeat/postpone expression. |
| 391 | 今日做到咁已經好叻喇。 | 好 / 叻 → 好叻 | neutral | Indexed praise formula versus productive degree/adjective. |
| 415 | 你仲留唔留住畢業嗰個通訊錄？ | 通訊 / 錄 → 通訊錄 | better | Restores address book. |
| 438 | 一到春天我就打乞嗤。 | 打 / 乞 / 嗤 → 打乞嗤 | better | Restores sneeze. |
| 450 | 尋日練得太勁，今日成身痠痛。 | 成 / 身 / 痠 / 痛 → 成身 / 痠痛 | better | Restores all-over-the-body and aching units. |
| 486 | 滿一百減二十，唔係八折呀。 | 八 / 折 → 八折 | neutral | Conventional indexed discount label versus explicit numeral/unit splitting. |
