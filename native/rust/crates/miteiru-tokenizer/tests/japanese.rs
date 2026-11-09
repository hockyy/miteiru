use miteiru_tokenizer::japanese::{suffix, DictionaryWord, Tokenizer};
use miteiru_tokenizer::lexicon::{ExtraWord, WordSource};
use std::path::PathBuf;

#[test]
fn ipadic_contract_context_unicode_suffixes_and_live_extra_words() {
    let directory = std::env::var_os("MITEIRU_IPADIC_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../node_modules/kuromoji/dict")
        });
    if !directory.is_dir() {
        eprintln!("IPADIC integration test needs npm ci or MITEIRU_IPADIC_DIR");
        return;
    }
    let mut tokenizer = Tokenizer::from_directory(&directory).unwrap();
    let tokens = tokenizer.tokenize("寿司を食べられなかった。");
    let eat = tokens
        .iter()
        .find(|token| token.surface_form == "食べ")
        .unwrap();
    assert_eq!(eat.pos, "動詞");
    assert_eq!(eat.pos_detail_1, "自立");
    assert_eq!(eat.basic_form, "食べる");
    assert_eq!(eat.reading.as_deref(), Some("タベ"));
    assert_eq!(eat.pronunciation.as_deref(), Some("タベ"));
    assert_ne!(eat.conjugated_type, "*");
    assert_ne!(eat.conjugated_form, "*");
    for text in [
        "😊😊最高！",
        "👨‍👩‍👧‍👦と旅行",
        "abc123はＯＫ",
        "ｶﾞｯﾂﾎﾟｰｽﾞ",
        "\0星詠み",
        "",
        "お新造固有語様",
    ] {
        let tokens = tokenizer.tokenize(text);
        assert_eq!(
            tokens
                .iter()
                .map(|token| token.surface_form.as_str())
                .collect::<String>(),
            text
        );
        let mut position = 1;
        for token in tokens {
            assert_eq!(token.word_position, position);
            position += token.surface_form.chars().count();
        }
    }
    let halfwidth = tokenizer.tokenize("ﾊﾟｿｺﾝ");
    assert_eq!(halfwidth[0].surface_form, "ﾊﾟｿｺﾝ");
    assert_eq!(halfwidth[0].reading.as_deref(), Some("パソコン"));
    for (text, expected) in [
        ("Wi-Fiで", vec!["Wi-Fi", "で"]),
        ("USB-Cを", vec!["USB-C", "を"]),
        ("3.5秒", vec!["3.5", "秒"]),
        ("20%です", vec!["20%", "です"]),
        ("12:30に", vec!["12:30", "に"]),
        ("五百円", vec!["五百", "円"]),
        ("二〇二六年", vec!["二〇二六", "年"]),
        ("1万2000円", vec!["1万2000", "円"]),
    ] {
        assert_eq!(
            tokenizer
                .tokenize(text)
                .iter()
                .map(|token| token.surface_form.as_str())
                .collect::<Vec<_>>(),
            expected
        );
    }
    tokenizer.set_dictionary_words([DictionaryWord {
        surface: "新造複合名詞".into(),
        reading: "しんぞうふくごうめいし".into(),
        conditions: suffix::NOUN,
        noun: true,
    }]);
    assert_eq!(tokenizer.app_word_count(), 0);
    assert!(!tokenizer
        .tokenize("新造複合名詞を読む")
        .iter()
        .any(|token| token.surface_form == "新造複合名詞"));
    tokenizer.set_dictionary_words_with_app(
        [
            DictionaryWord {
                surface: "おかわり".into(),
                reading: "おかわり".into(),
                conditions: suffix::NOUN | suffix::VS,
                noun: true,
            },
            DictionaryWord {
                surface: "かわる".into(),
                reading: "かわる".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "忘れる".into(),
                reading: "わすれる".into(),
                conditions: suffix::V1,
                noun: false,
            },
            DictionaryWord {
                surface: "食べる".into(),
                reading: "たべる".into(),
                conditions: suffix::V1,
                noun: false,
            },
            DictionaryWord {
                surface: "書く".into(),
                reading: "かく".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "だろう".into(),
                reading: "だろう".into(),
                conditions: 0,
                noun: false,
            },
            DictionaryWord {
                surface: "バズる".into(),
                reading: "ばずる".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "子供".into(),
                reading: "こども".into(),
                conditions: suffix::NOUN,
                noun: true,
            },
            DictionaryWord {
                surface: "子供っぽい".into(),
                reading: "こどもっぽい".into(),
                conditions: suffix::ADJI,
                noun: false,
            },
            DictionaryWord {
                surface: "高い".into(),
                reading: "たかい".into(),
                conditions: suffix::ADJI,
                noun: false,
            },
            DictionaryWord {
                surface: "高さ".into(),
                reading: "たかさ".into(),
                conditions: suffix::NOUN,
                noun: true,
            },
            DictionaryWord {
                surface: "飲む".into(),
                reading: "のむ".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "する".into(),
                reading: "する".into(),
                conditions: suffix::VS,
                noun: false,
            },
            DictionaryWord {
                surface: "待つ".into(),
                reading: "まつ".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "待たせる".into(),
                reading: "またせる".into(),
                conditions: suffix::V1,
                noun: false,
            },
            DictionaryWord {
                surface: "なさる".into(),
                reading: "なさる".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "くださる".into(),
                reading: "くださる".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "くれる".into(),
                reading: "くれる".into(),
                conditions: suffix::V1,
                noun: false,
            },
            DictionaryWord {
                surface: "ござる".into(),
                reading: "ござる".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "選ぶ".into(),
                reading: "えらぶ".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "掛ける".into(),
                reading: "かける".into(),
                conditions: suffix::V1,
                noun: false,
            },
            DictionaryWord {
                surface: "なる".into(),
                reading: "なる".into(),
                conditions: suffix::V5,
                noun: false,
            },
            DictionaryWord {
                surface: "だ".into(),
                reading: "だ".into(),
                conditions: 0,
                noun: false,
            },
            DictionaryWord {
                surface: "です".into(),
                reading: "です".into(),
                conditions: 0,
                noun: false,
            },
            DictionaryWord {
                surface: "ない".into(),
                reading: "ない".into(),
                conditions: suffix::ADJI,
                noun: false,
            },
            DictionaryWord {
                surface: "じゃない".into(),
                reading: "じゃない".into(),
                conditions: 0,
                noun: false,
            },
            DictionaryWord {
                surface: "新造複合名詞".into(),
                reading: "しんぞうふくごうめいし".into(),
                conditions: suffix::NOUN,
                noun: true,
            },
        ],
        true,
    );
    assert!(tokenizer
        .tokenize("新造複合名詞を読む")
        .iter()
        .any(|token| token.surface_form == "新造複合名詞"));
    assert!(tokenizer
        .tokenize_with_suffixes("雨が降るだろう")
        .iter()
        .any(|token| token.surface_form == "だろう"));
    let childish = tokenizer.tokenize_with_suffixes("子供っぽかった");
    assert_eq!(childish.len(), 1);
    assert_eq!(childish[0].basic_form, "子供っぽい");
    assert_eq!(childish[0].pos, "形容詞");
    let height = tokenizer.tokenize_with_suffixes("高さ");
    assert_eq!(height[0].basic_form, "高さ");
    assert_eq!(height[0].pos, "名詞");
    for (surface, expected) in [
        ("飲んじゃおうか", vec!["飲んじゃおう", "か"]),
        ("お選びくださいませ", vec!["お選びくださいませ"]),
        ("お掛けになってください", vec!["お掛けになってください"]),
        ("お待たせして", vec!["お待たせして"]),
        ("ございません", vec!["ございません"]),
        ("じゃなくて", vec!["じゃなくて"]),
        ("子供じゃなかった", vec!["子供", "じゃなかった"]),
        ("おかわりして", vec!["お", "かわり", "して"]),
        ("だったよ", vec!["だった", "よ"]),
        ("なさらないでください", vec!["なさらないでください"]),
        ("待ってくんない", vec!["待ってくんない"]),
    ] {
        let words = tokenizer.tokenize_with_suffixes(surface);
        assert_eq!(
            words
                .iter()
                .map(|word| word.surface_form.as_str())
                .collect::<Vec<_>>(),
            expected,
            "{surface}"
        );
        assert!(words[0].reading.is_some(), "{surface}");
    }
    for (surface, base) in [
        ("忘れちゃわない", "忘れる"),
        ("食べちゃった", "食べる"),
        ("書いとく", "書く"),
        ("食べれる", "食べる"),
        ("バズっちゃった", "バズる"),
        ("食べさせていただきます", "食べる"),
    ] {
        let tokens = tokenizer.tokenize_with_suffixes(surface);
        assert_eq!(tokens.len(), 1, "{surface}: {tokens:?}");
        assert_eq!(tokens[0].basic_form, base);
        assert!(tokens[0].reading.is_some());
    }
    assert!(!tokenizer
        .tokenize("あの新造固有語を見ている")
        .iter()
        .any(|token| token.surface_form == "新造固有語"));
    tokenizer.set_user_words(&[ExtraWord {
        surface: "新造固有語".into(),
        source: WordSource::UserManual,
    }]);
    let with_word = tokenizer.tokenize("あの新造固有語を見ている");
    assert_eq!(with_word[0].pos, "連体詞");
    assert_eq!(with_word[1].surface_form, "新造固有語");
    assert_eq!(tokenizer.tokenize("お新造固有語様")[0].pos, "接頭詞");
    assert_eq!(tokenizer.tokenize("あの")[0].pos, "フィラー");
    assert_eq!(tokenizer.tokenize("お")[0].pos, "感動詞");
    tokenizer.set_user_words(&[]);
    assert!(!tokenizer
        .tokenize("あの新造固有語を見ている")
        .iter()
        .any(|token| token.surface_form == "新造固有語"));
}
