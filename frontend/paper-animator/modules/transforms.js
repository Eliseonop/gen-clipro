import { EASING } from './constants.js';
import { lerp } from './utils.js';

export function getVisualStateAtTime(timeInSeconds, keyframes) {
    const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
    let currentState = 'open';

    for (const kf of sortedKeyframes) {
        if (kf.time < timeInSeconds) {
            if (kf.paperAnim === 'open') {
                currentState = 'open';
            } else if (kf.paperAnim === 'close') {
                currentState = 'closed';
            }
        } else {
            break;
        }
    }
    return currentState;
}

export function getAdvancedTransform(timeInSeconds, objectState) {
    const keyframes = [...objectState.animation.keyframes].sort((a, b) => a.time - b.time);
    let currentTransform = {
        x: objectState.image.offset.x,
        y: objectState.image.offset.y,
        scale: objectState.image.size,
        rotation: objectState.image.rotation
    };

    let prevKeyframe, nextKeyframe;

    if (keyframes.length > 0) {
        prevKeyframe = keyframes[0];
        nextKeyframe = keyframes[keyframes.length - 1];

        for (let i = 0; i < keyframes.length; i++) {
            if (keyframes[i].time <= timeInSeconds) {
                prevKeyframe = keyframes[i];
            }
            if (keyframes[i].time > timeInSeconds) {
                nextKeyframe = keyframes[i];
                break;
            }
        }

        if (prevKeyframe === nextKeyframe) {
            currentTransform = {
                x: prevKeyframe.x,
                y: prevKeyframe.y,
                scale: prevKeyframe.scale,
                rotation: prevKeyframe.rotation
            };
        } else {
            if (prevKeyframe.easing === 'instant') {
                currentTransform = {
                    x: nextKeyframe.x,
                    y: nextKeyframe.y,
                    scale: nextKeyframe.scale,
                    rotation: nextKeyframe.rotation
                };
            } else {
                const segmentDuration = nextKeyframe.time - prevKeyframe.time;
                const timeIntoSegment = timeInSeconds - prevKeyframe.time;
                let progress = (segmentDuration > 0) ? timeIntoSegment / segmentDuration : 1;
                progress = Math.max(0, Math.min(1, progress));

                const easingFunc = EASING[prevKeyframe.easing] || EASING.linear;
                const easedProgress = easingFunc(progress);

                currentTransform.x = lerp(prevKeyframe.x, nextKeyframe.x, easedProgress);
                currentTransform.y = lerp(prevKeyframe.y, nextKeyframe.y, easedProgress);
                currentTransform.scale = lerp(prevKeyframe.scale, nextKeyframe.scale, easedProgress);
                currentTransform.rotation = lerp(prevKeyframe.rotation, nextKeyframe.rotation, easedProgress);
            }
        }
    }

    return { transform: currentTransform, prevKeyframe, nextKeyframe };
}