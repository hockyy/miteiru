//! Words added on top of a tokenizer's base dictionary.

/// Where an extra word comes from. It decides how strongly the word competes with the base
/// dictionary: a word the user typed in beats one the AI saved, which beats a dictionary headword.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum WordSource {
    /// A headword from the app's own dictionary (CC-CEDICT, CantoDict, JMdict) the base list lacks.
    AppDictionary,
    /// Saved to Your dictionary by AI word splitting.
    UserAi,
    /// Added to Your dictionary by hand.
    UserManual,
}

/// One extra word. Readings and meanings stay with the caller; tokenizers only need the surface.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ExtraWord {
    pub surface: String,
    pub source: WordSource,
}
