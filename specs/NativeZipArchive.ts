import { TurboModule, TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  unzip: (sourceFilePath: string, distDirPath: string) => Promise<void>;
  zip: (sourceDirPath: string, destFilePath: string) => Promise<void>;
  remoteUnzip: (
    distDirPath: string,
    url: string,
    headers: Object,
  ) => Promise<void>;
  remoteZip: (
    sourceDirPath: string,
    url: string,
    headers: Object,
  ) => Promise<string>; // return response as text
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeZipArchive');
