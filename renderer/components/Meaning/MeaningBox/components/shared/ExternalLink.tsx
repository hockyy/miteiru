import React from 'react';

type ExternalLinkProps = {
  urlBase: string;
  displayText: string;
  query: string;
  style?: React.CSSProperties;
};

/** Opens an external dictionary URL via the Electron shell. */
export const ExternalLink = ({
  urlBase,
  displayText,
  query,
  style = {},
}: ExternalLinkProps) => {
  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    window.electronAPI.openExternal(`${urlBase}${query}`);
  };

  return (
    <a style={style} className="url-bubble" onClick={handleClick}>
      {displayText}
    </a>
  );
};
