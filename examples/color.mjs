#!/usr/bin/env node

import { data, extend } from '@lapis-lang/lapis-js';

// Simple enumeration ADT with multiple fold operations
const Color = data(() => ({
    Red: {},
    Green: {},
    Blue: {},
    toHex: {
        op: 'fold',
        out: String,
        Red() { return '#FF0000'; },
        Green() { return '#00FF00'; },
        Blue() { return '#0000FF'; }
    },
    toRGB: {
        op: 'fold',
        out: String,
        Red() { return 'rgb(255, 0, 0)'; },
        Green() { return 'rgb(0, 255, 0)'; },
        Blue() { return 'rgb(0, 0, 255)'; }
    },
    isWarm: {
        op: 'fold',
        out: Boolean,
        Red() { return true; },
        Green() { return false; },
        Blue() { return false; }
    }
}));

// Extend with additional colors
const ExtendedColor = data(() => ({
    [extend]: Color,
    Yellow: {},
    Orange: {},
    Purple: {},
    toHex: {
        op: 'fold',
        Yellow() { return '#FFFF00'; },
        Orange() { return '#FFA500'; },
        Purple() { return '#800080'; }
    },
    toRGB: {
        op: 'fold',
        Yellow() { return 'rgb(255, 255, 0)'; },
        Orange() { return 'rgb(255, 165, 0)'; },
        Purple() { return 'rgb(128, 0, 128)'; }
    },
    isWarm: {
        op: 'fold',
        Yellow() { return true; },
        Orange() { return true; },
        Purple() { return false; }
    }
}));

console.log('=== Color ADT Example ===\n');

console.log('Basic Colors:');
console.log(`Red: ${Color.Red.toHex} | ${Color.Red.toRGB} | Warm: ${Color.Red.isWarm}`);
console.log(`Green: ${Color.Green.toHex} | ${Color.Green.toRGB} | Warm: ${Color.Green.isWarm}`);
console.log(`Blue: ${Color.Blue.toHex} | ${Color.Blue.toRGB} | Warm: ${Color.Blue.isWarm}`);

console.log('\nExtended Colors:');
console.log(`Yellow: ${ExtendedColor.Yellow.toHex} | ${ExtendedColor.Yellow.toRGB} | Warm: ${ExtendedColor.Yellow.isWarm}`);
console.log(`Orange: ${ExtendedColor.Orange.toHex} | ${ExtendedColor.Orange.toRGB} | Warm: ${ExtendedColor.Orange.isWarm}`);
console.log(`Purple: ${ExtendedColor.Purple.toHex} | ${ExtendedColor.Purple.toRGB} | Warm: ${ExtendedColor.Purple.isWarm}`);

console.log('\nType checking:');
console.log(`Red instanceof Color: ${Color.Red instanceof Color}`);
console.log(`Yellow instanceof Color: ${ExtendedColor.Yellow instanceof Color}`);
console.log(`Yellow instanceof ExtendedColor: ${ExtendedColor.Yellow instanceof ExtendedColor}`);
console.log(`Red instanceof ExtendedColor: ${ExtendedColor.Red instanceof ExtendedColor}`);
