import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  className = '',
  disabled,
  loading,
  children,
  ...rest
}) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-btn px-4 py-2 text-sm font-medium transition-colors shadow-btn focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    primary: 'bg-primary text-onPrimary hover:bg-primary-700 focus:ring-primary-300',
    secondary: 'bg-secondary text-onSecondary hover:bg-secondary-700 focus:ring-secondary-300',
    danger: 'bg-error text-onPrimary hover:bg-error-700 focus:ring-error-300',
    ghost: 'bg-transparent text-primary hover:bg-primary-100 focus:ring-primary-300',
  }[variant];
  return (
    <button
      className={`${baseClasses} ${variantClasses} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4 mr-2 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
};
