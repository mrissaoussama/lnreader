import { NativeModules } from 'react-native';

const { HtmlParser } = NativeModules;

interface HtmlParserInterface {
  parse(url: string, selector: string, headers?: Record<string, string>): Promise<string>;
  parseArray(url: string, selector: string, headers?: Record<string, string>): Promise<string[]>;
  getAttribute(url: string, selector: string, attribute: string, headers?: Record<string, string>): Promise<string>;
}

export default HtmlParser as HtmlParserInterface;
