import re
import string
from functools import lru_cache
import numpy as np
import torch
import nltk
import textstat

from collections import Counter
from nltk.corpus import stopwords
from transformers import (
    AutoTokenizer,
    AutoModel,
    GPT2Tokenizer,
    GPT2LMHeadModel
)


# ===============================
# GLOBAL CONFIG
# ===============================
MAX_TOKENS = 512
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def _ensure_nltk_resources():
    resources = {
        "punkt": "tokenizers/punkt",
        "stopwords": "corpora/stopwords",
        "averaged_perceptron_tagger": "taggers/averaged_perceptron_tagger",
    }
    for resource_name, resource_path in resources.items():
        try:
            nltk.data.find(resource_path)
        except LookupError:
            nltk.download(resource_name, quiet=True)


_ensure_nltk_resources()
stop_words = set(stopwords.words("english"))

# ===============================
# TEXT CLEANING
# ===============================
def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^\w\s.,!?]", "", text)
    return text.strip()

# ===============================
# LOAD BERT (ONCE)
# ===============================
bert_tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
bert_model = AutoModel.from_pretrained("bert-base-uncased").to(device)
bert_model.eval()

def get_bert_embedding(text: str) -> np.ndarray:
    text = clean_text(text)

    if not text:
        return np.zeros(768, dtype=np.float32)

    embeddings = []

    with torch.no_grad():
        # text-based chunking to avoid overflow
        for i in range(0, len(text), 2000):
            chunk_text = text[i:i + 2000]

            inputs = bert_tokenizer(
                chunk_text,
                return_tensors="pt",
                truncation=True,
                padding=True,
                max_length=512
            )

            inputs = {k: v.to(device) for k, v in inputs.items()}
            outputs = bert_model(**inputs)

            cls_embedding = outputs.last_hidden_state[:, 0, :]
            embeddings.append(cls_embedding.cpu().numpy())

    return np.mean(embeddings, axis=0).squeeze()

# ===============================
# LOAD GPT-2 (ONCE)
# ===============================
gpt2_tokenizer = GPT2Tokenizer.from_pretrained("gpt2")
gpt2_model = GPT2LMHeadModel.from_pretrained("gpt2").to(device)
gpt2_model.eval()


def compute_perplexity(text: str) -> float:
    inputs = gpt2_tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512
    ).to(device)

    with torch.no_grad():
        outputs = gpt2_model(**inputs, labels=inputs["input_ids"])
        return float(torch.exp(outputs.loss).item())

# ===============================
# STYLOMETRIC FEATURES
# ===============================
def stylometric_analysis_no_perplexity(text):
    sentences = nltk.sent_tokenize(text)
    words = nltk.word_tokenize(text.lower())
    words = [w for w in words if w.isalpha()]

    num_words = len(words)
    num_sentences = len(sentences)

    # ---- Sentence length stats ----
    sent_lengths = [len(nltk.word_tokenize(s)) for s in sentences if s.strip()]
    avg_sent_len = np.mean(sent_lengths) if sent_lengths else 0
    sent_len_var = np.var(sent_lengths) if len(sent_lengths) > 1 else 0

    # ---- Burstiness ----
    burstiness = sent_len_var / avg_sent_len if avg_sent_len > 0 else 0

    # ---- Stopword ratio ----
    stopword_ratio = (
        sum(1 for w in words if w in stop_words) / num_words
        if num_words > 0 else 0
    )

    # ---- Repetition metrics ----
    unigram_rep = 1 - (len(set(words)) / num_words) if num_words > 0 else 0

    bigrams = list(nltk.bigrams(words))
    bigram_counts = Counter(bigrams)
    bigram_rep = (
        sum(1 for c in bigram_counts.values() if c > 1) / len(bigram_counts)
        if bigram_counts else 0
    )

    # ---- POS tag distribution ----
    pos_tags = nltk.pos_tag(words)
    pos_counts = Counter(tag for _, tag in pos_tags)
    noun_ratio = sum(pos_counts[t] for t in ["NN", "NNS", "NNP", "NNPS"]) / num_words if num_words else 0
    verb_ratio = sum(pos_counts[t] for t in ["VB", "VBD", "VBG", "VBN", "VBP", "VBZ"]) / num_words if num_words else 0
    adj_ratio = sum(pos_counts[t] for t in ["JJ", "JJR", "JJS"]) / num_words if num_words else 0

    # ---- Punctuation normalization ----
    punct_ratio = sum(1 for c in text if c in string.punctuation) / max(len(text), 1)

    # ---- Readability ----
    readability = textstat.flesch_reading_ease(text)

    return np.array([
        num_words,
        num_sentences,
        avg_sent_len,
        sent_len_var,
        burstiness,
        stopword_ratio,
        unigram_rep,
        bigram_rep,
        noun_ratio,
        verb_ratio,
        adj_ratio,
        punct_ratio,
        readability
    ])


def stylometric_analysis(text):
    base = stylometric_analysis_no_perplexity(text)
    perplexity = compute_perplexity(text)
    return np.concatenate([base, np.array([perplexity], dtype=np.float32)])


@lru_cache(maxsize=512)
def _get_chunk_heavy_features_cached(chunk_text: str):
    bert_features = get_bert_embedding(chunk_text).astype(np.float32)
    perplexity = compute_perplexity(chunk_text)
    return bert_features, perplexity


def build_features_with_chunk_context(sentence_text: str, chunk_text: str) -> np.ndarray:
    chunk_bert, chunk_perplexity = _get_chunk_heavy_features_cached(chunk_text)
    sentence_style = stylometric_analysis_no_perplexity(sentence_text).astype(np.float32)
    style_with_perplexity = np.concatenate(
        [sentence_style, np.array([chunk_perplexity], dtype=np.float32)]
    )
    return np.concatenate([chunk_bert, style_with_perplexity]).astype(np.float32)


# ===============================
# FINAL FEATURE VECTOR
# ===============================
@lru_cache(maxsize=2048)
def _extract_features_cached(text: str):
    bert_features = get_bert_embedding(text)
    style_features = stylometric_analysis(text)
    return np.concatenate([bert_features, style_features]).astype(np.float32)


def extract_features(text: str) -> np.ndarray:
    """
    FINAL FEATURE VECTOR
    Shape = (768 + 14,) = (782,)
    MUST MATCH TRAINING
    """
    return _extract_features_cached(text).copy()
