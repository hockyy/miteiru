import json
import jieba
from pypinyin import pinyin, Style
import re
import logging


# Set logging level for Jieba to suppress informational messages
logging.getLogger('jieba').setLevel(logging.ERROR)

# Function to separate Pinyin with tone numbers
def separate_pinyin(pinyin_string):
    # Regular expression to match Pinyin syllables
    pattern = re.compile(r'\S+')
    return pattern.findall(pinyin_string)

# Function to get the pinyin of a word
def get_pinyin(word):
    return ' '.join([item[0] for item in pinyin(word)])

# Function to generate JSON with tokenization and pinyin
def generate_json(sentence):
    # Use Jieba for tokenization
    jieba_tokens = jieba.tokenize(sentence)

    # Initialize the result list
    result = []

    # Loop through each tokenized word
    for tk in jieba_tokens:
        word = tk[0]
        word_pinyin = get_pinyin(word)
        separation_dict = [{"main": word, "pinyin": word_pinyin}]

        # Separate pinyin for individual characters if the word has multiple characters
        if len(word) > 1:
            separation = separate_pinyin(word_pinyin)
            if len(separation) == len(word):
                separation_dict = [{"main": word[i], "pinyin": separation[i]} for i in range(len(word))]

        word_dict = {
            "origin": word,
            "pinyin": word_pinyin,
            "separation": separation_dict
        }
        result.append(word_dict)

    return json.dumps(result, ensure_ascii=False)

if __name__ == "__main__":
    while True:
        sentence = input()
        jsonRes = generate_json(sentence)
        print(jsonRes)
