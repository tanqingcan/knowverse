import { afterAll, describe, expect, it } from "vitest";
import { checkSql, runSandboxSql, sameResult, type SqlResult } from "@/server/sandbox";

const result = (rows: unknown[][], columns = ["value"]): SqlResult => ({ columns, rows, rowCount: rows.length, truncated: false, ms: 0 });

describe("SQL 沙箱静态安全", () => {
  it.each([
    ["S1", "DROP TABLE school_v1.students", "sql_not_select"],
    ["S2", "DELETE FROM school_v1.students", "sql_not_select"],
    ["S3", "UPDATE school_v1.students SET name='x'", "sql_not_select"],
    ["S4", "INSERT INTO school_v1.students VALUES (1)", "sql_not_select"],
    ["S5", "SELECT 1; SELECT 2", "sql_multi"],
    ["S6", "SELECT pg_sleep(5)", "sql_forbidden"],
    ["S7", "COPY school_v1.students TO '/tmp/x'", "sql_forbidden"],
  ])("%s 拒绝不允许的输入", (_, sql, code) => {
    expect(() => checkSql(sql)).toThrowError(expect.objectContaining({ code }));
  });
  it("S9 拒绝空语句和过长输入", () => {
    expect(() => checkSql("-- comment")).toThrowError(expect.objectContaining({ code: "sql_empty" }));
    expect(() => checkSql("SELECT " + "1".repeat(4000))).toThrowError(expect.objectContaining({ code: "sql_too_long" }));
  });
  it("S10 允许注释和字符串内分号", () => {
    expect(checkSql("/* comment */ SELECT 'a;b' AS x; -- end")).toBe("SELECT 'a;b' AS x");
  });
});

describe.skipIf(!process.env.SANDBOX_DATABASE_URL)("SQL 沙箱真实执行", () => {
  afterAll(async () => {
    await globalThis.__kvSandboxPool?.end();
    globalThis.__kvSandboxPool = undefined;
  });
  it("S8 系统目录元数据可读，不能宣称系统目录被禁用", async () => {
    const r = await runSandboxSql("school_v1", "SELECT relname FROM pg_catalog.pg_class LIMIT 1");
    expect(r.rowCount).toBe(1);
  });
  it("S11 练习表正常返回且事务为只读", async () => {
    const r = await runSandboxSql("school_v1", "SELECT count(*), current_setting('transaction_read_only') FROM school_v1.students");
    expect(r.rows[0]).toEqual(["6", "on"]);
  });
  it("S12 写入 CTE 被数据库拒绝，之后仍能查询", async () => {
    await expect(runSandboxSql("school_v1", "WITH x AS (DELETE FROM students RETURNING *) SELECT * FROM x")).rejects.toMatchObject({ code: "sql_error" });
    expect((await runSandboxSql("school_v1", "SELECT count(*) FROM students")).rows[0][0]).toBe("6");
  });
  it("S13 不接受任意数据集/业务表", async () => {
    await expect(runSandboxSql("public", "SELECT 1")).rejects.toMatchObject({ code: "sandbox_dataset" });
    await expect(runSandboxSql("school_v1", "SELECT * FROM public.users")).rejects.toMatchObject({ code: "sql_error" });
  });
  it("S14 行数截断到 200，不能据此判完整结果相等", async () => {
    const r = await runSandboxSql("school_v1", "SELECT * FROM generate_series(1, 205)");
    expect(r.rowCount).toBe(200);
    expect(r.truncated).toBe(true);
    expect(sameResult(r, r, false).equal).toBe(false);
  });
  it("E3b 数据库 float8 计算采用浮点容差", async () => {
    const a = await runSandboxSql("school_v1", "SELECT 0.1::float8 + 0.2::float8");
    const b = await runSandboxSql("school_v1", "SELECT 0.3::float8");
    expect(sameResult(a, b, false).equal).toBe(true);
  });
});

describe("SQL 结果等价判定", () => {
  it("E1 无序多重集忽略顺序，保留重复次数", () => {
    expect(sameResult(result([[1], [2], [1]]), result([[2], [1], [1]]), false).equal).toBe(true);
    expect(sameResult(result([[1], [2], [1]]), result([[2], [2], [1]]), false).equal).toBe(false);
  });
  it("E2 NULL 等于 NULL，区别于零、字符串和空值文本", () => {
    expect(sameResult(result([[null]]), result([[null]]), false).equal).toBe(true);
    for (const value of [0, "null", ""]) expect(sameResult(result([[null]]), result([[value]]), false).equal).toBe(false);
  });
  it("E3 1e-6 绝对容差，同时拒绝超差值", () => {
    expect(sameResult(result([[0.1 + 0.2]]), result([[0.3]]), true).equal).toBe(true);
    expect(sameResult(result([[0]]), result([[1e-6]]), false).equal).toBe(true);
    expect(sameResult(result([[0]]), result([[1.1e-6]]), false).equal).toBe(false);
  });
  it("E4 列名不敏感、列数与行数必须一致", () => {
    expect(sameResult(result([[1]], ["a"]), result([[1]], ["b"]), false).equal).toBe(true);
    expect(sameResult(result([[1]]), result([[1, 2]], ["a", "b"]), false).equal).toBe(false);
    expect(sameResult(result([[1]]), result([]), false).equal).toBe(false);
  });
  it("E5 ordered 时必须保持行序", () => {
    expect(sameResult(result([[1], [2]]), result([[2], [1]]), true).equal).toBe(false);
  });
  it("E6 近似行需重新匹配，不能贪心取首个命中", () => {
    const a = result([[0.9e-6], [0]]), b = result([[0], [1.8e-6]]);
    expect(sameResult(a, b, false).equal).toBe(true);
    expect(sameResult(b, a, false).equal).toBe(true);
  });
  it("E7 数值与文本分开，bigint 文本不转成有损 Number", () => {
    expect(sameResult(result([[1]]), result([["1"]]), false).equal).toBe(false);
    expect(sameResult(result([["9007199254740992"]]), result([["9007199254740993"]]), false).equal).toBe(false);
  });
  it("E8 空结果相等；无穷大不与有限值相等", () => {
    expect(sameResult(result([]), result([]), false).equal).toBe(true);
    expect(sameResult(result([[Infinity]]), result([[1]]), false).equal).toBe(false);
    expect(sameResult(result([[Infinity]]), result([[Infinity]]), false).equal).toBe(true);
  });
});
