#!/usr/bin/env node

import { data } from '@lapis-lang/lapis-js';

// Structured data ADT with multiple variants
const Point = data(() => ({
    Point2D: { x: Number, y: Number },
    Point3D: { x: Number, y: Number, z: Number },
    distanceFromOrigin: {
        op: 'fold',
        out: Number,
        Point2D({ x, y }) {
            return Math.sqrt(x * x + y * y);
        },
        Point3D({ x, y, z }) {
            return Math.sqrt(x * x + y * y + z * z);
        }
    },
    quadrant: {
        op: 'fold',
        out: String,
        Point2D({ x, y }) {
            if (x >= 0 && y >= 0) return 'Q1 (Northeast)';
            if (x < 0 && y >= 0) return 'Q2 (Northwest)';
            if (x < 0 && y < 0) return 'Q3 (Southwest)';
            return 'Q4 (Southeast)';
        },
        Point3D({ x, y, z }) {
            const signs = [x >= 0 ? '+' : '-', y >= 0 ? '+' : '-', z >= 0 ? '+' : '-'];
            return `Octant(${signs.join(', ')})`;
        }
    },
    toString: {
        op: 'fold',
        out: String,
        Point2D({ x, y }) {
            return `(${x}, ${y})`;
        },
        Point3D({ x, y, z }) {
            return `(${x}, ${y}, ${z})`;
        }
    }
}));

console.log('=== Point ADT Example ===\n');

// Create points using named arguments
console.log('Creating points (named arguments):');
const p1 = Point.Point2D({ x: 3, y: 4 });
const p2 = Point.Point2D({ x: -5, y: 12 });
const p3 = Point.Point3D({ x: 1, y: 2, z: 2 });

console.log(`p1 = ${p1.toString}`);
console.log(`p2 = ${p2.toString}`);
console.log(`p3 = ${p3.toString}`);

// Create points using positional arguments
console.log('\nCreating points (positional arguments):');
const p4 = Point.Point2D(6, 8);
const p5 = Point.Point3D(3, 4, 12);

console.log(`p4 = ${p4.toString}`);
console.log(`p5 = ${p5.toString}`);

console.log('\nDistance from origin:');
console.log(`p1: ${p1.distanceFromOrigin}`);
console.log(`p2: ${p2.distanceFromOrigin}`);
console.log(`p3: ${p3.distanceFromOrigin}`);
console.log(`p4: ${p4.distanceFromOrigin}`);
console.log(`p5: ${p5.distanceFromOrigin}`);

console.log('\nQuadrant/Octant:');
console.log(`p1 (3, 4): ${p1.quadrant}`);
console.log(`p2 (-5, 12): ${p2.quadrant}`);
console.log(`p3 (1, 2, 2): ${p3.quadrant}`);

console.log('\nType checking:');
console.log(`p1 instanceof Point.Point2D: ${p1 instanceof Point.Point2D}`);
console.log(`p1 instanceof Point: ${p1 instanceof Point}`);
console.log(`p3 instanceof Point.Point3D: ${p3 instanceof Point.Point3D}`);
console.log(`p3 instanceof Point.Point2D: ${p3 instanceof Point.Point2D}`);

console.log('\nField access:');
console.log(`p1.x = ${p1.x}, p1.y = ${p1.y}`);
console.log(`p3.x = ${p3.x}, p3.y = ${p3.y}, p3.z = ${p3.z}`);
