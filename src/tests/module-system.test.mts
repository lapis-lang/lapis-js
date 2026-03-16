import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { module, system, data } from '../index.mjs';

describe('system() — Mealy machine program entry point', () => {
    describe('basic wiring', () => {
        test('passes module definitions to wiring function', () => {
            const EventModule = module({}, () => ({
                Event: data(() => ({ Tick: {}, Reset: {} }))
            }));
            let received: unknown;
            system({ Events: EventModule }, (mods) => {
                received = mods;
                return {
                    init: 0,
                    request: (n: number) => n,
                    respond: (_s: number) => (_r: unknown) => 0
                };
            });
            assert.ok(typeof (received as Record<string, unknown>).Events === 'function');
        });

        test('wiring can instantiate modules and use their exports', () => {
            const ShapeModule = module({}, () => ({
                Shape: data(() => ({
                    Circle: { radius: Number },
                    Square: { side: Number }
                }))
            }));

            const app = system({ Shapes: ShapeModule }, ({ Shapes }) => {
                const { Shape } = Shapes({});
                const init = Shape.Circle({ radius: 5 });
                return {
                    init,
                    request: (s: { radius: number }) => ({ area: Math.PI * s.radius ** 2 }),
                    respond: (s: { radius: number }) => (_r: unknown) => s
                };
            });

            const area = app.request(app.init).area;
            assert.ok(Math.abs(area - Math.PI * 25) < 0.001);
        });
    });

    describe('Mealy machine protocol', () => {
        test('init is the initial state', () => {
            const app = system({}, () => ({
                init: { count: 0 },
                request: (s: { count: number }) => ({ type: 'tick', count: s.count }),
                respond: (_s: unknown) => (_r: unknown) => ({ count: 1 })
            }));
            assert.deepStrictEqual(app.init, { count: 0 });
        });

        test('request is a pure function of state', () => {
            const app = system({}, () => ({
                init: 0,
                request: (n: number) => ({ value: n * 2 }),
                respond: (_s: unknown) => (_r: unknown) => 0
            }));
            assert.deepStrictEqual(app.request(3), { value: 6 });
            assert.deepStrictEqual(app.request(10), { value: 20 });
        });

        test('respond returns a function that produces the next state', () => {
            const app = system({}, () => ({
                init: 0,
                request: (n: number) => ({ count: n }),
                respond: (n: number) => (_r: unknown) => n + 1
            }));

            let state = app.init;
            state = app.respond(state)({});
            assert.strictEqual(state, 1);
            state = app.respond(state)({});
            assert.strictEqual(state, 2);
            state = app.respond(state)({});
            assert.strictEqual(state, 3);
        });

        test('respond threads response into next state', () => {
            interface State { phase: string; content: string }
            interface Response { data: string }

            const app = system({}, () => ({
                init: { phase: 'read', content: '' } as State,
                request: (s: State) => ({ type: s.phase }),
                respond: (s: State) => (r: Response) => ({
                    phase: 'write',
                    content: r.data
                })
            }));

            const next = app.respond(app.init)({ data: 'hello' });
            assert.strictEqual(next.phase, 'write');
            assert.strictEqual(next.content, 'hello');
        });

        test('full request/respond cycle simulates Mealy machine loop', () => {
            interface State { phase: string; args: string[]; content: string }
            interface Request { type: string; path?: string; message?: string; code?: number }
            interface Response { content?: string }

            const app = system({}, () => ({
                init: { phase: 'read', args: ['file.txt'], content: '' } as State,
                request: ({ phase, args, content }: State): Request => {
                    if (phase === 'read') return { type: 'Read', path: args[0] };
                    if (phase === 'write') return { type: 'Write', message: content };
                    return { type: 'Done', code: 0 };
                },
                respond: ({ phase, args }: State) => (r: Response): State => {
                    if (phase === 'read')
                        return { phase: 'write', args, content: r.content ?? '' };
                    return { phase: 'done', args, content: '' };
                }
            }));

            // Step 1: read phase
            let state = app.init;
            assert.strictEqual(app.request(state).type, 'Read');

            // Step 2: respond with file content
            state = app.respond(state)({ content: 'file data' });
            assert.strictEqual(state.phase, 'write');
            assert.strictEqual(state.content, 'file data');
            assert.strictEqual(app.request(state).type, 'Write');

            // Step 3: respond to write, reach done
            state = app.respond(state)({});
            assert.strictEqual(state.phase, 'done');
            assert.strictEqual(app.request(state).type, 'Done');
        });
    });

    describe('multi-module wiring', () => {
        test('multiple modules can be wired together', () => {
            const PointModule = module({}, () => ({
                Point: data(() => ({ Point2D: { x: Number, y: Number } }))
            }));
            const VectorModule = module({}, () => ({
                Vector: data(() => ({ Vec: { dx: Number, dy: Number } }))
            }));

            const app = system(
                { Points: PointModule, Vectors: VectorModule },
                ({ Points, Vectors }) => {
                    const { Point } = Points({});
                    const { Vector } = Vectors({});
                    const origin = Point.Point2D({ x: 0, y: 0 });
                    const offset = Vector.Vec({ dx: 3, dy: 4 });
                    const init = { point: origin, vector: offset };
                    return {
                        init,
                        request: (s: { point: { x: number; y: number }; vector: { dx: number; dy: number } }) => ({
                            newX: s.point.x + s.vector.dx,
                            newY: s.point.y + s.vector.dy
                        }),
                        respond: (s: typeof init) => (_r: unknown) => s
                    };
                }
            );

            const req = app.request(app.init);
            assert.strictEqual(req.newX, 3);
            assert.strictEqual(req.newY, 4);
        });

        test('module exports can be used as deps for another module', () => {
            const TagModule = module({}, () => ({
                Tag: data(() => ({ Tag: { label: String } }))
            }));
            const WrapperModule = module(
                {},
                ({ TagClass }: { TagClass: object }) => ({
                    Wrapper: data(() => ({ Wrapped: { source: TagClass } }))
                })
            );

            const app = system(
                { Tags: TagModule, Wrapper: WrapperModule },
                ({ Tags, Wrapper }) => {
                    const { Tag } = Tags({});
                    const { Wrapper: WrapperADT } = Wrapper({ TagClass: Tag });
                    const t = Tag.Tag({ label: 'hello' });
                    type Seed = { source: { label: string } };
                    const init = WrapperADT.Wrapped({ source: t }) as unknown as Seed;
                    return {
                        init,
                        request: (s: Seed) => s.source.label,
                        respond: (_s: unknown) => (_r: unknown) => init
                    };
                }
            );

            assert.strictEqual(app.request(app.init), 'hello');
        });
    });

    describe('validation', () => {
        const systemAny = system as any;

        test('missing init field throws TypeError', () => {
            assert.throws(
                () => systemAny({}, () => ({
                    request: () => ({}),
                    respond: () => () => ({})
                })),
                TypeError
            );
        });

        test('missing request function throws TypeError', () => {
            assert.throws(
                () => systemAny({}, () => ({
                    init: {},
                    respond: () => () => ({})
                })),
                TypeError
            );
        });

        test('missing respond function throws TypeError', () => {
            assert.throws(
                () => systemAny({}, () => ({
                    init: {},
                    request: () => ({})
                })),
                TypeError
            );
        });

        test('non-function request throws TypeError', () => {
            assert.throws(
                () => systemAny({}, () => ({
                    init: {},
                    request: 42,
                    respond: () => () => ({})
                })),
                TypeError
            );
        });

        test('null return throws TypeError', () => {
            assert.throws(
                () => systemAny({}, () => null),
                TypeError
            );
        });

        test('error message is descriptive', () => {
            assert.throws(
                () => systemAny({}, () => ({})),
                (err: Error) => err.message.includes('init') && err.message.includes('request') && err.message.includes('respond')
            );
        });
    });
});

