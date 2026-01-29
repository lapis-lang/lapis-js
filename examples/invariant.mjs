import { data, invariant, extend } from '../src/index.mjs';

// Example 1: Character range with ordering constraint
console.log('=== Character Range Example ===');

const isChar = (s) => typeof s === 'string' && s.length === 1;

const CharRange = data(() => ({
    Range: {
        [invariant]: ({ start, end }) => start <= end,
        start: isChar,
        end: isChar
    }
}));

const lowercaseRange = CharRange.Range({ start: 'a', end: 'z' });
console.log('Lowercase range:', lowercaseRange);

try {
    CharRange.Range({ start: 'z', end: 'a' }); // Violates invariant
} catch (e) {
    console.log('Error caught:', e.message);
}

// Example 2: Rectangle with area constraint
console.log('\n=== Rectangle Example ===');

const Rectangle = data(() => ({
    Rect: {
        [invariant]: ({ width, height, area }) => width * height === area,
        width: Number,
        height: Number,
        area: Number
    }
}));

const validRect = Rectangle.Rect({ width: 5, height: 10, area: 50 });
console.log('Valid rectangle:', validRect);

try {
    Rectangle.Rect({ width: 5, height: 10, area: 100 }); // Violates invariant
} catch (e) {
    console.log('Error caught:', e.message);
}

// Example 3: Triangle with triangle inequality
console.log('\n=== Triangle Example ===');

const triangleInequality = ({ a, b, c }) =>
    a + b > c && b + c > a && c + a > b;

const Triangle = data(() => ({
    Triangle: {
        [invariant]: triangleInequality,
        a: Number,
        b: Number,
        c: Number
    }
}));

const validTriangle = Triangle.Triangle({ a: 3, b: 4, c: 5 });
console.log('Valid triangle (3-4-5):', validTriangle);

try {
    Triangle.Triangle({ a: 1, b: 2, c: 10 }); // Violates triangle inequality
} catch (e) {
    console.log('Error caught:', e.message);
}

// Example 4: Date range
console.log('\n=== Date Range Example ===');

const DateRange = data(() => ({
    Range: {
        [invariant]: ({ startDate, endDate }) => startDate <= endDate,
        startDate: Date,
        endDate: Date
    }
}));

const validDateRange = DateRange.Range({
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31')
});
console.log('Valid date range:', validDateRange);

try {
    DateRange.Range({
        startDate: new Date('2024-12-31'),
        endDate: new Date('2024-01-01')
    });
} catch (e) {
    console.log('Error caught:', e.message);
}

// Example 5: Regular language with extended variants
console.log('\n=== Regular Language Example ===');

const RegularLanguage = data(() => ({
    Empty: {},
    Epsilon: {},
    Symbol: { symbol: isChar }
}));

const ExtendedRegularLanguage = data(() => ({
    [extend]: RegularLanguage,
    Any: {},
    Range: {
        [invariant]: ({ start, end }) => start <= end,
        start: isChar,
        end: isChar
    }
}));

const anyPattern = ExtendedRegularLanguage.Any;
console.log('Any pattern (wildcard):', anyPattern);

const digitRange = ExtendedRegularLanguage.Range({ start: '0', end: '9' });
console.log('Digit range [0-9]:', digitRange);

try {
    ExtendedRegularLanguage.Range({ start: '9', end: '0' }); // Violates invariant
} catch (e) {
    console.log('Error caught:', e.message);
}

// Inherited variants still work
const emptyPattern = ExtendedRegularLanguage.Empty;
console.log('Empty pattern:', emptyPattern);

console.log('\n=== All examples completed successfully ===');
