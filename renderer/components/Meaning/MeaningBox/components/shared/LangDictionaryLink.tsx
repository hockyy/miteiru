import React from 'react';
import { videoConstants } from '../../../../../utils/constants';
import { ExternalLink } from './ExternalLink';

type LangDictionaryLinkProps = {
  lang: string;
  queryText: string;
};

/** Picks the default external dictionary link for the current language. */
export const LangDictionaryLink = ({ lang, queryText }: LangDictionaryLinkProps) => {
  if (lang === videoConstants.japaneseLang) {
    return (
      <ExternalLink
        style={{ color: 'black' }}
        urlBase="https://jisho.org/search/"
        displayText="Jisho"
        query={queryText}
      />
    );
  }

  if (lang === videoConstants.cantoneseLang) {
    return (
      <ExternalLink
        style={{ color: 'black' }}
        urlBase="https://cantonese.org/search.php?q="
        displayText="Cantonese.org"
        query={queryText}
      />
    );
  }

  return null;
};
