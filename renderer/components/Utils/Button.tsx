import React, { type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'link';
type ButtonSize = 'small' | 'medium';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> {
  type?: ButtonVariant;
  size?: ButtonSize;
  onPress?: () => void;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'miteiru-btn--primary',
  secondary: 'miteiru-btn--secondary',
  danger: 'miteiru-btn--danger',
  link: 'miteiru-btn--link',
};

const sizeClass: Record<ButtonSize, string> = {
  small: 'miteiru-btn--small',
  medium: 'miteiru-btn--medium',
};

export const Button = ({
  type = 'primary',
  size = 'medium',
  onPress,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) => {
  const isLink = type === 'link';

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={[
        'miteiru-btn',
        variantClass[type],
        isLink ? '' : sizeClass[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
};
