// Bridges the Swift LiveActivityModule to JS — same legacy
// RCT_EXTERN_MODULE approach as SpotlightModule.m.
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (LiveActivityModule, NSObject)

RCT_EXTERN_METHOD(startActivity : (NSDictionary *)data withResolver : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(updateActivity : (NSDictionary *)data withResolver : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(endActivity : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)

@end
