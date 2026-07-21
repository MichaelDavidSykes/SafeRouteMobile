export interface LoginPasswordAutofillHints {
  autoComplete: 'current-password' | 'off';
  textContentType: 'none' | 'password';
}

export interface LoginCredentialDefaults {
  email: string;
  password: string;
}

const CONNECTIVITY_CONTRACT_CREDENTIALS: LoginCredentialDefaults = {
  email: 'driver@example.com',
  password: 'guidance-contract-password'
};

export function resolveLoginCredentialDefaults(
  connectivityContractEnabled: boolean
): LoginCredentialDefaults {
  return connectivityContractEnabled
    ? CONNECTIVITY_CONTRACT_CREDENTIALS
    : { email: '', password: '' };
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
