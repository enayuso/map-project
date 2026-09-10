// Bridges the Swift SpotlightModule to JS the legacy RCT_EXTERN_MODULE way
// — no Codegen'd TurboModule spec needed for a module this small; the New
// Architecture's interop layer still honors this registration style.
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE (SpotlightModule, RCTEventEmitter)

RCT_EXTERN_METHOD(indexItems : (NSArray *)items)
RCT_EXTERN_METHOD(deindexAll)
RCT_EXTERN_METHOD(getPendingItemId : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

@end
