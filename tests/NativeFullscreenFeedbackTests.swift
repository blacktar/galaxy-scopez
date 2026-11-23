import Foundation

@main
struct NativeFullscreenFeedbackTests {
    static func main() {
        precondition(NativeFullscreenFeedback.confirmed(before: false, samples: [nil, false, false, true]) == true)
        precondition(NativeFullscreenFeedback.confirmed(before: true, samples: [true, true, nil, false]) == false)
        precondition(NativeFullscreenFeedback.confirmed(before: false, samples: [false, false, nil]) == nil)
        precondition(NativeFullscreenFeedback.confirmed(before: nil, samples: [true, true]) == nil)
        print("Fullscreen feedback: delayed on/off, stale and unknown-state checks passed. No Resolve calls.")
    }
}
