/** 统一业务错误：code 供前端判断，message 面向用户（中文） */
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public detail?: unknown) {
    super(message);
  }
}
export const notFound = (what = "资源") => new AppError("not_found", `${what}不存在或无权访问`, 404);
export const forbidden = () => new AppError("forbidden", "无权访问", 403);
