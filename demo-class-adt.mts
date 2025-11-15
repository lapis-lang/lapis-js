import { data } from '@lapis-lang/lapis-js'

// Simple enumeration
const Color = data({ Red: {}, Green: {}, Blue: {} })

console.log('Color.Red:', Color.Red)
console.log('Color.Red.constructor.name:', Color.Red.constructor.name)

// Structured data with nested ADT - should have proper type inference
const ColorPoint = data({ 
  Point2: { x: Number, y: Number, color: Color },
  Point3: { x: Number, y: Number, z: Number, color: Color }
})

// No 'new' keyword needed - callable!
const p2 = ColorPoint.Point2({ x: 10, y: 20, color: Color.Red })
console.log('\nPoint2:', p2)
console.log('Point2.color:', p2.color)
console.log('Point2.color.constructor.name:', p2.color.constructor.name)

const p3 = ColorPoint.Point3({ x: 1, y: 2, z: 3, color: Color.Blue })
console.log('\nPoint3:', p3)
console.log('Point3.constructor.name:', p3.constructor.name)

// Predicates
const isEven = (x: unknown): x is number => typeof x === 'number' && x % 2 === 0

const EvenPoint = data({ Point2: { x: isEven, y: isEven }})

const evenP = EvenPoint.Point2({ x: 2, y: 4 })
console.log('\nEvenPoint:', evenP)
console.log('EvenPoint.constructor.name:', evenP.constructor.name)

// instanceof checks
console.log('\ninstanceof checks:')
console.log('p2 instanceof Point2:', p2 instanceof (ColorPoint.Point2 as any))
console.log('p3 instanceof Point3:', p3 instanceof (ColorPoint.Point3 as any))
console.log('Color.Red instanceof Red:', Color.Red instanceof (Color.Red.constructor as any))

// Frozen and immutable
console.log('\nImmutability:')
console.log('Is p2 frozen?', Object.isFrozen(p2))
console.log('Is Color frozen?', Object.isFrozen(Color))
console.log('Is Color.Red frozen?', Object.isFrozen(Color.Red))
