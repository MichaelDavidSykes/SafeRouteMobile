export interface LoginPasswordAutofillHints {
  autoComplete: 'current-password' | 'off';
  textContentType: 'none' | 'password';
}

export function resolveLoginPasswordAutofillHints(
  connectivityContractEnabled: boolean
): LoginPasswordAutofillHints {
  if (connectivityContractEnabled) {
    return {
      autoComplete: 'off',
      textContentType: 'none'
    };
  }

  return {
    autoComplete: 'current-password',
    textContentType: 'password'
  };
}
