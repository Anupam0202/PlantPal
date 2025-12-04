import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'gradient';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'icon';
  isLoading?: boolean;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  as?: React.ElementType;
  href?: string;
  target?: string;
  rel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  icon,
  iconPosition = 'left',
  fullWidth = false,
  as: Component = 'button',
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center
    font-semibold rounded-xl
    focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900
    transition-all duration-200 ease-out
    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
    active:scale-[0.98]
    ${fullWidth ? 'w-full' : ''}
  `.replace(/\s+/g, ' ').trim();

  const variantStyles: Record<string, string> = {
    primary: `
      bg-gradient-to-r from-emerald-500 to-emerald-600
      text-white shadow-lg shadow-emerald-500/25
      hover:from-emerald-600 hover:to-emerald-700 hover:shadow-xl hover:shadow-emerald-500/30
      focus:ring-emerald-500
      dark:from-emerald-600 dark:to-emerald-700
      dark:hover:from-emerald-500 dark:hover:to-emerald-600
    `,
    secondary: `
      bg-gradient-to-r from-teal-500 to-cyan-600
      text-white shadow-lg shadow-teal-500/25
      hover:from-teal-600 hover:to-cyan-700 hover:shadow-xl hover:shadow-teal-500/30
      focus:ring-teal-500
    `,
    gradient: `
      bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500
      text-white shadow-lg shadow-emerald-500/30
      hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600
      hover:shadow-xl hover:-translate-y-0.5
      focus:ring-emerald-500
    `,
    danger: `
      bg-gradient-to-r from-red-500 to-rose-600
      text-white shadow-lg shadow-red-500/25
      hover:from-red-600 hover:to-rose-700 hover:shadow-xl hover:shadow-red-500/30
      focus:ring-red-500
    `,
    ghost: `
      bg-transparent text-emerald-600
      hover:bg-emerald-50 hover:text-emerald-700
      dark:text-emerald-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300
      focus:ring-emerald-500
    `,
    outline: `
      bg-transparent text-emerald-600
      border-2 border-emerald-500
      hover:bg-emerald-50 hover:border-emerald-600
      dark:text-emerald-400 dark:border-emerald-500
      dark:hover:bg-emerald-900/30 dark:hover:border-emerald-400
      focus:ring-emerald-500
    `,
  };

  const sizeStyles: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5',
    xl: 'px-8 py-4 text-lg gap-3',
    icon: 'p-2.5',
  };

  const loadingSpinner = (
    <svg
      className={`animate-spin ${size === 'sm' ? 'h-3 w-3' : size === 'icon' ? 'h-4 w-4' : 'h-5 w-5'}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  const iconElement = icon && (
    <span className={`flex-shrink-0 ${size === 'icon' ? '' : 'w-5 h-5'} flex items-center justify-center`}>
      {icon}
    </span>
  );

  return (
    <Component
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={Component === 'button' ? (props.disabled || isLoading) : undefined}
      {...props}
    >
      {isLoading ? (
        <>
          {loadingSpinner}
          {children && size !== 'icon' && <span className="ml-2">{children}</span>}
        </>
      ) : (
        <>
          {icon && iconPosition === 'left' && iconElement}
          {children}
          {icon && iconPosition === 'right' && iconElement}
        </>
      )}
    </Component>
  );
};