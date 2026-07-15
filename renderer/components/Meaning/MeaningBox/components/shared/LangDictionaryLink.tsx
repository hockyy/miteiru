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
        urlBase="https://jisho.org/search/"
        displayText="Jisho"
        query={queryText}
        className="border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-xs! font-bold text-blue-800 hover:bg-yellow-100"
      />
    );
  }

  if (lang === videoConstants.cantoneseLang) {
    return (
      <ExternalLink
        urlBase="https://cantonese.org/search.php?q="
        displayText="Cantonese.org"
        query={queryText}
        className="border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-xs! font-bold text-blue-800 hover:bg-yellow-100"
      />
    );
  }

  return null;
};
