// Provide missing Reflect.decorate type for environments using reflect-metadata
declare namespace Reflect {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function decorate(decorators: any, target: any, propertyKey?: string | symbol, attributes?: any): any;
}

export {};
