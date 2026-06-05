"""
Pydantic 请求/响应模型 — API 数据校验与序列化

来源: 详细设计 §4.6.3
"""
from pydantic import BaseModel, Field
from typing import Any


# ===== 模型解析 =====


class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1, description="SysML v2 文本内容")


class ParseResponse(BaseModel):
    model: dict[str, Any]
    warnings: list[str] = []


# ===== 项目文件操作 =====


class ProjectMetadataDict(BaseModel):
    name: str
    created: str  # ISO 8601
    modified: str
    version: str  # 项目格式版本号


class ProjectDataDict(BaseModel):
    metadata: ProjectMetadataDict
    semantic_model: dict[str, Any]
    canvas_model: dict[str, Any]


class CreateProjectRequest(BaseModel):
    dir_path: str = Field(..., description="项目目录路径")
    name: str = Field(..., min_length=1, max_length=128)


class CreateProjectResponse(BaseModel):
    project_data: ProjectDataDict


class OpenProjectRequest(BaseModel):
    file_path: str = Field(..., description=".sysml2proj 文件路径")


class OpenProjectResponse(BaseModel):
    project_data: ProjectDataDict


class SaveProjectRequest(BaseModel):
    file_path: str
    project_data: ProjectDataDict


class SaveProjectResponse(BaseModel):
    success: bool
    file_path: str
    file_size: int = 0


# ===== 模型校验 =====


class ValidateRequest(BaseModel):
    model: dict[str, Any]


class ValidationIssueDict(BaseModel):
    code: str  # 错误码 (如 'E001', 'W002')
    message: str  # 人类可读消息
    element_id: str | None = None
    severity: str  # 'error' | 'warning'
    source_location: str | None = None


class ValidateResponse(BaseModel):
    is_valid: bool
    errors: list[ValidationIssueDict] = []
    warnings: list[ValidationIssueDict] = []


# ===== 导出 =====


class ExportSVGRequest(BaseModel):
    svg_markup: str
    output_path: str


class ExportPNGRequest(BaseModel):
    image_data: str = Field(..., description="Base64 编码的 PNG 数据")
    output_path: str


class ExportResponse(BaseModel):
    success: bool
    file_path: str = ""
    file_size: int = 0
    error_message: str | None = None
