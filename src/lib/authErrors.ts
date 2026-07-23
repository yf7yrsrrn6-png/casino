/** Maps backend error codes to i18n keys under the `auth` namespace. */
export function authErrorKey(code?: string): string {
  switch (code) {
    case 'email_taken':
      return 'auth.errorUserExists'
    case 'invalid_credentials':
      return 'auth.errorInvalidCredentials'
    case 'account_banned':
      return 'auth.errorBanned'
    case 'rate_limited':
      return 'auth.errorRateLimited'
    case 'validation_error':
      return 'auth.errorValidation'
    default:
      return 'auth.errorGeneric'
  }
}
