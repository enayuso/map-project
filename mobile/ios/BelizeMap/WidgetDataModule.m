// Bridges the Swift WidgetDataModule to JS — same legacy
// RCT_EXTERN_MODULE approach as SpotlightModule.m/LiveActivityModule.m.
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (WidgetDataModule, NSObject)

RCT_EXTERN_METHOD(updateWidgetData : (NSDictionary *)data)

@end
