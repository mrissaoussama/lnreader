declare module '@env' {
  export const GIT_HASH: string;
  export const RELEASE_DATE: string;
  export const BUILD_TYPE: 'Debug' | 'Release' | 'Beta' | 'Github Action';
}
