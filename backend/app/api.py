import re
import unicodedata
import uuid
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .config import settings
from .database import get_db
from .ingestion import ingest_file
from .models import (
    AdminRegion,
    BlockedUser,
    Dataset,
    DatasetStatus,
    DatasetType,
    Membership,
    User,
    Workspace,
    WorkspaceApplication,
    WorkspaceApplicationStatus,
    WorkspaceRole,
)
from .schemas import (
    AdminDatasetOut,
    AdminOverviewOut,
    AdminTransferOwner,
    AdminUserOut,
    AdminUserPatch,
    AdminWorkspaceOut,
    DatasetOut,
    DatasetPatch,
    LoginRequest,
    MemberInvite,
    MemberOut,
    RegistrationResponse,
    TokenResponse,
    UserCreate,
    UserOut,
    WorkspaceApplicationOut,
    WorkspaceApplicationPatch,
    WorkspaceOut,
)
from .security import create_access_token, get_current_user, hash_password, verify_password
from .storage import ObjectStorage, get_storage

router = APIRouter()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or f"workspace-{uuid.uuid4().hex[:8]}"


def _workspace_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip().casefold()
    return re.sub(r"\s+", " ", normalized)


def _dataset_out(dataset: Dataset) -> DatasetOut:
    output = DatasetOut.model_validate(dataset)
    owner = dataset.__dict__.get("owner")
    if owner is not None:
        output.owner_name = owner.display_name
    return output


def _is_platform_admin(user: User) -> bool:
    admin_username = settings.platform_admin_username.strip().casefold()
    return bool(admin_username and user.username.casefold() == admin_username)


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        is_admin=_is_platform_admin(user),
    )


def _require_platform_admin(user: User) -> None:
    if not _is_platform_admin(user):
        raise HTTPException(status_code=403, detail="只有平台管理员可以管理全部账号")


async def _membership(db: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    membership = await db.scalar(
        select(Membership).where(Membership.workspace_id == workspace_id, Membership.user_id == user_id)
    )
    if not membership:
        raise HTTPException(status_code=403, detail="你无权访问这个工作空间")
    return membership


async def _editable_membership(db: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    membership = await _membership(db, workspace_id, user_id)
    if membership.role == WorkspaceRole.viewer:
        raise HTTPException(status_code=403, detail="只读成员不能修改数据")
    return membership


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/auth/register", response_model=RegistrationResponse, status_code=201)
async def register(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> RegistrationResponse:
    username = payload.username.strip().casefold()
    if await db.scalar(select(User.id).where(func.lower(User.username) == username)):
        raise HTTPException(status_code=409, detail="用户名已被注册")

    workspace_name = payload.workspace_name.strip()
    workspace = await db.scalar(
        select(Workspace).where(Workspace.name_key == _workspace_key(workspace_name))
    )
    user = User(
        username=username,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.flush()

    if workspace:
        db.add(
            WorkspaceApplication(
                workspace_id=workspace.id,
                user_id=user.id,
                status=WorkspaceApplicationStatus.pending,
                requested_role=WorkspaceRole.viewer,
            )
        )
        await db.commit()
        return RegistrationResponse(
            status="pending",
            message=f"已向“{workspace.name}”管理员提交加入申请，请等待审批后登录",
            user=_user_out(user),
        )

    base_slug = _slugify(workspace_name)
    slug = base_slug
    if await db.scalar(select(Workspace.id).where(Workspace.slug == slug)):
        slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"
    workspace = Workspace(
        name=workspace_name,
        name_key=_workspace_key(workspace_name),
        slug=slug,
        created_by=user.id,
    )
    db.add(workspace)
    await db.flush()
    db.add(Membership(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.owner))
    await db.commit()
    return RegistrationResponse(
        status="active",
        message="工作室创建成功",
        access_token=create_access_token(user.id),
        user=_user_out(user),
    )


@router.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    username = payload.username.strip().casefold()
    user = await db.scalar(select(User).where(func.lower(User.username) == username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if await db.scalar(select(BlockedUser.user_id).where(BlockedUser.user_id == user.id)):
        raise HTTPException(status_code=403, detail="账号已被平台管理员停用")
    if not _is_platform_admin(user) and not await db.scalar(select(Membership.id).where(Membership.user_id == user.id)):
        application = await db.scalar(
            select(WorkspaceApplication)
            .where(WorkspaceApplication.user_id == user.id)
            .order_by(WorkspaceApplication.created_at.desc())
        )
        if application and application.status == WorkspaceApplicationStatus.pending:
            raise HTTPException(status_code=403, detail="加入申请正在等待工作室管理员审批")
        if application and application.status == WorkspaceApplicationStatus.rejected:
            raise HTTPException(status_code=403, detail="加入申请未通过，请联系工作室管理员")
        raise HTTPException(status_code=403, detail="账号尚未加入任何工作室")
    return TokenResponse(access_token=create_access_token(user.id), user=_user_out(user))


@router.get("/auth/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(user)


@router.get("/admin/users", response_model=list[AdminUserOut])
async def list_platform_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminUserOut]:
    _require_platform_admin(user)
    rows = (
        await db.execute(
            select(
                User,
                func.count(Membership.workspace_id).label("workspace_count"),
                BlockedUser.user_id.is_not(None).label("is_blocked"),
            )
            .outerjoin(Membership, Membership.user_id == User.id)
            .outerjoin(BlockedUser, BlockedUser.user_id == User.id)
            .group_by(User.id, BlockedUser.user_id)
            .order_by(User.created_at.desc())
        )
    ).all()
    return [
        AdminUserOut(
            id=account.id,
            username=account.username,
            display_name=account.display_name,
            created_at=account.created_at,
            workspace_count=workspace_count,
            is_blocked=is_blocked,
            is_admin=_is_platform_admin(account),
        )
        for account, workspace_count, is_blocked in rows
    ]


@router.patch("/admin/users/{account_id}", response_model=AdminUserOut)
async def patch_platform_user(
    account_id: uuid.UUID,
    payload: AdminUserPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    _require_platform_admin(user)
    account = await db.get(User, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    if account.id == user.id or _is_platform_admin(account):
        raise HTTPException(status_code=409, detail="不能停用平台管理员账号")
    blocked = await db.get(BlockedUser, account.id)
    if payload.blocked and not blocked:
        db.add(BlockedUser(user_id=account.id, blocked_by=user.id))
    elif not payload.blocked and blocked:
        await db.delete(blocked)
    await db.commit()
    workspace_count = await db.scalar(
        select(func.count(Membership.workspace_id)).where(Membership.user_id == account.id)
    )
    return AdminUserOut(
        id=account.id,
        username=account.username,
        display_name=account.display_name,
        created_at=account.created_at,
        workspace_count=workspace_count or 0,
        is_blocked=payload.blocked,
        is_admin=_is_platform_admin(account),
    )


@router.delete("/admin/users/{account_id}", status_code=204)
async def delete_platform_user(
    account_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_platform_admin(user)
    account = await db.get(User, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    if account.id == user.id or _is_platform_admin(account):
        raise HTTPException(status_code=409, detail="不能删除平台管理员账号")
    owned = (
        await db.scalars(
            select(Workspace.name)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .where(Membership.user_id == account.id, Membership.role == WorkspaceRole.owner)
        )
    ).all()
    if owned:
        raise HTTPException(status_code=409, detail=f"请先转移这些工作室的管理员权限：{'、'.join(owned)}")

    owned_datasets = (await db.scalars(select(Dataset).where(Dataset.owner_id == account.id))).all()
    for dataset in owned_datasets:
        replacement_id = await db.scalar(
            select(Membership.user_id).where(
                Membership.workspace_id == dataset.workspace_id,
                Membership.role == WorkspaceRole.owner,
            )
        )
        if not replacement_id:
            raise HTTPException(status_code=409, detail="数据所在工作室缺少管理员，暂不能删除账号")
        dataset.owner_id = replacement_id
    created_workspaces = (await db.scalars(select(Workspace).where(Workspace.created_by == account.id))).all()
    for workspace in created_workspaces:
        replacement_id = await db.scalar(
            select(Membership.user_id).where(
                Membership.workspace_id == workspace.id,
                Membership.role == WorkspaceRole.owner,
            )
        )
        if not replacement_id:
            raise HTTPException(status_code=409, detail="工作室缺少管理员，暂不能删除账号")
        workspace.created_by = replacement_id
    await db.delete(account)
    await db.commit()


@router.get("/admin/overview", response_model=AdminOverviewOut)
async def platform_overview(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminOverviewOut:
    _require_platform_admin(user)
    user_count = int(await db.scalar(select(func.count(User.id))) or 0)
    blocked_count = int(await db.scalar(select(func.count(BlockedUser.user_id))) or 0)
    return AdminOverviewOut(
        user_count=user_count,
        active_user_count=max(0, user_count - blocked_count),
        blocked_user_count=blocked_count,
        workspace_count=int(await db.scalar(select(func.count(Workspace.id))) or 0),
        dataset_count=int(await db.scalar(select(func.count(Dataset.id))) or 0),
        storage_bytes=int(await db.scalar(select(func.coalesce(func.sum(Dataset.size_bytes), 0))) or 0),
    )


@router.get("/admin/workspaces", response_model=list[AdminWorkspaceOut])
async def list_platform_workspaces(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminWorkspaceOut]:
    _require_platform_admin(user)
    member_count = select(func.count(Membership.id)).where(Membership.workspace_id == Workspace.id).correlate(Workspace).scalar_subquery()
    dataset_count = select(func.count(Dataset.id)).where(Dataset.workspace_id == Workspace.id).correlate(Workspace).scalar_subquery()
    storage_bytes = select(func.coalesce(func.sum(Dataset.size_bytes), 0)).where(Dataset.workspace_id == Workspace.id).correlate(Workspace).scalar_subquery()
    rows = (
        await db.execute(
            select(Workspace, User, member_count, dataset_count, storage_bytes)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .join(User, User.id == Membership.user_id)
            .where(Membership.role == WorkspaceRole.owner)
            .order_by(Workspace.created_at.desc())
        )
    ).all()
    return [
        AdminWorkspaceOut(
            id=workspace.id,
            name=workspace.name,
            slug=workspace.slug,
            owner_id=owner.id,
            owner_name=owner.display_name,
            owner_username=owner.username,
            member_count=int(members or 0),
            dataset_count=int(datasets or 0),
            storage_bytes=int(size or 0),
            created_at=workspace.created_at,
        )
        for workspace, owner, members, datasets, size in rows
    ]


@router.get("/admin/workspaces/{workspace_id}/members", response_model=list[MemberOut])
async def list_platform_workspace_members(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MemberOut]:
    _require_platform_admin(user)
    if not await db.get(Workspace, workspace_id):
        raise HTTPException(status_code=404, detail="工作室不存在")
    rows = (
        await db.execute(
            select(User, Membership.role)
            .join(Membership, Membership.user_id == User.id)
            .where(Membership.workspace_id == workspace_id)
            .order_by(Membership.role, User.display_name)
        )
    ).all()
    return [MemberOut(id=member.id, username=member.username, display_name=member.display_name, role=role) for member, role in rows]


@router.delete("/admin/workspaces/{workspace_id}/members/{account_id}", status_code=204)
async def remove_platform_workspace_member(
    workspace_id: uuid.UUID,
    account_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_platform_admin(user)
    membership = await db.scalar(select(Membership).where(Membership.workspace_id == workspace_id, Membership.user_id == account_id))
    if not membership:
        raise HTTPException(status_code=404, detail="工作室成员不存在")
    if membership.role == WorkspaceRole.owner:
        raise HTTPException(status_code=409, detail="请先转移工作室管理员权限")
    await db.delete(membership)
    await db.commit()


@router.post("/admin/workspaces/{workspace_id}/transfer-owner", response_model=list[MemberOut])
async def transfer_platform_workspace_owner(
    workspace_id: uuid.UUID,
    payload: AdminTransferOwner,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MemberOut]:
    _require_platform_admin(user)
    target = await db.scalar(select(Membership).where(Membership.workspace_id == workspace_id, Membership.user_id == payload.user_id))
    if not target:
        raise HTTPException(status_code=404, detail="目标账号不是该工作室成员")
    await db.execute(
        update(Membership)
        .where(Membership.workspace_id == workspace_id, Membership.role == WorkspaceRole.owner)
        .values(role=WorkspaceRole.editor)
    )
    target.role = WorkspaceRole.owner
    workspace = await db.get(Workspace, workspace_id)
    if workspace:
        workspace.created_by = target.user_id
    await db.commit()
    return await list_platform_workspace_members(workspace_id, user, db)


@router.get("/admin/datasets", response_model=list[AdminDatasetOut])
async def list_platform_datasets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminDatasetOut]:
    _require_platform_admin(user)
    rows = (
        await db.execute(
            select(Dataset, Workspace, User)
            .join(Workspace, Workspace.id == Dataset.workspace_id)
            .join(User, User.id == Dataset.owner_id)
            .order_by(Dataset.created_at.desc())
        )
    ).all()
    return [
        AdminDatasetOut(
            id=dataset.id,
            name=dataset.name,
            workspace_id=workspace.id,
            workspace_name=workspace.name,
            owner_id=owner.id,
            owner_name=owner.display_name,
            type=dataset.type,
            status=dataset.status,
            source_filename=dataset.source_filename,
            size_bytes=dataset.size_bytes,
            created_at=dataset.created_at,
        )
        for dataset, workspace, owner in rows
    ]


@router.get("/workspaces", response_model=list[WorkspaceOut])
async def list_workspaces(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[WorkspaceOut]:
    rows = (
        await db.execute(
            select(Workspace, Membership.role)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .where(Membership.user_id == user.id)
            .order_by(Workspace.created_at)
        )
    ).all()
    return [WorkspaceOut(id=item.id, name=item.name, slug=item.slug, role=role) for item, role in rows]


@router.get("/workspaces/{workspace_id}/members", response_model=list[MemberOut])
async def list_members(workspace_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[MemberOut]:
    await _membership(db, workspace_id, user.id)
    rows = (
        await db.execute(
            select(User, Membership.role).join(Membership).where(Membership.workspace_id == workspace_id)
        )
    ).all()
    return [MemberOut(id=member.id, username=member.username, display_name=member.display_name, role=role) for member, role in rows]


@router.post("/workspaces/{workspace_id}/members", response_model=MemberOut)
async def invite_member(payload: MemberInvite, workspace_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> MemberOut:
    membership = await _membership(db, workspace_id, user.id)
    if membership.role != WorkspaceRole.owner:
        raise HTTPException(status_code=403, detail="只有工作空间所有者可以添加成员")
    member = await db.scalar(select(User).where(func.lower(User.username) == payload.username.strip().casefold()))
    if not member:
        raise HTTPException(status_code=404, detail="该用户名尚未注册")
    existing = await db.scalar(select(Membership).where(Membership.workspace_id == workspace_id, Membership.user_id == member.id))
    if existing:
        existing.role = payload.role
    else:
        db.add(Membership(workspace_id=workspace_id, user_id=member.id, role=payload.role))
    application = await db.scalar(
        select(WorkspaceApplication).where(
            WorkspaceApplication.workspace_id == workspace_id,
            WorkspaceApplication.user_id == member.id,
        )
    )
    if application:
        application.status = WorkspaceApplicationStatus.approved
        application.requested_role = payload.role
        application.reviewed_by = user.id
        application.reviewed_at = datetime.now(UTC)
    await db.commit()
    return MemberOut(id=member.id, username=member.username, display_name=member.display_name, role=payload.role)


@router.get(
    "/workspaces/{workspace_id}/applications",
    response_model=list[WorkspaceApplicationOut],
)
async def list_workspace_applications(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WorkspaceApplicationOut]:
    membership = await _membership(db, workspace_id, user.id)
    if membership.role != WorkspaceRole.owner:
        raise HTTPException(status_code=403, detail="只有工作室所有者可以查看加入申请")
    rows = (
        await db.execute(
            select(WorkspaceApplication, User)
            .join(User, User.id == WorkspaceApplication.user_id)
            .where(
                WorkspaceApplication.workspace_id == workspace_id,
                WorkspaceApplication.status == WorkspaceApplicationStatus.pending,
            )
            .order_by(WorkspaceApplication.created_at)
        )
    ).all()
    return [
        WorkspaceApplicationOut(
            id=application.id,
            user_id=applicant.id,
            username=applicant.username,
            display_name=applicant.display_name,
            status=application.status,
            requested_role=application.requested_role,
            created_at=application.created_at,
        )
        for application, applicant in rows
    ]


@router.patch(
    "/workspaces/{workspace_id}/applications/{application_id}",
    response_model=WorkspaceApplicationOut,
)
async def review_workspace_application(
    workspace_id: uuid.UUID,
    application_id: uuid.UUID,
    payload: WorkspaceApplicationPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceApplicationOut:
    membership = await _membership(db, workspace_id, user.id)
    if membership.role != WorkspaceRole.owner:
        raise HTTPException(status_code=403, detail="只有工作室所有者可以审批加入申请")
    if payload.role == WorkspaceRole.owner:
        raise HTTPException(status_code=422, detail="申请人不能直接设为工作室所有者")
    application = await db.scalar(
        select(WorkspaceApplication).where(
            WorkspaceApplication.id == application_id,
            WorkspaceApplication.workspace_id == workspace_id,
        )
    )
    if not application:
        raise HTTPException(status_code=404, detail="加入申请不存在")
    applicant = await db.get(User, application.user_id)
    if not applicant:
        raise HTTPException(status_code=404, detail="申请账号不存在")

    application.status = WorkspaceApplicationStatus(payload.status)
    application.reviewed_by = user.id
    application.reviewed_at = datetime.now(UTC)
    application.requested_role = payload.role
    if application.status == WorkspaceApplicationStatus.approved:
        existing = await db.scalar(
            select(Membership).where(
                Membership.workspace_id == workspace_id,
                Membership.user_id == applicant.id,
            )
        )
        if existing:
            existing.role = payload.role
        else:
            db.add(
                Membership(
                    workspace_id=workspace_id,
                    user_id=applicant.id,
                    role=payload.role,
                )
            )
    await db.commit()
    return WorkspaceApplicationOut(
        id=application.id,
        user_id=applicant.id,
        username=applicant.username,
        display_name=applicant.display_name,
        status=application.status,
        requested_role=application.requested_role,
        created_at=application.created_at,
    )

@router.get("/workspaces/{workspace_id}/datasets", response_model=list[DatasetOut])
async def list_datasets(
    workspace_id: uuid.UUID,
    bbox: str | None = Query(default=None, description="west,south,east,north"),
    query: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DatasetOut]:
    await _membership(db, workspace_id, user.id)
    statement = (
        select(Dataset)
        .options(selectinload(Dataset.owner))
        .where(Dataset.workspace_id == workspace_id)
        .order_by(Dataset.created_at.desc())
    )
    if query:
        statement = statement.where(Dataset.name.ilike(f"%{query.strip()}%"))
    if bbox:
        try:
            west, south, east, north = [float(value) for value in bbox.split(",")]
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="bbox 格式应为 west,south,east,north") from exc
        statement = statement.where(
            func.ST_Intersects(
                Dataset.footprint, func.ST_MakeEnvelope(west, south, east, north, 4326)
            )
        )
    datasets = (await db.scalars(statement)).all()
    return [_dataset_out(dataset) for dataset in datasets]


@router.post("/workspaces/{workspace_id}/datasets", response_model=DatasetOut, status_code=201)
async def upload_dataset(
    workspace_id: uuid.UUID,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    epsg: int | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: ObjectStorage = Depends(get_storage),
) -> DatasetOut:
    await _editable_membership(db, workspace_id, user.id)
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"文件不能超过 {settings.max_upload_mb} MB")

    filename = file.filename or "dataset"
    suffix = Path(filename).suffix.lower()
    dataset = Dataset(
        workspace_id=workspace_id,
        owner_id=user.id,
        owner=user,
        name=name.strip() or filename or "未命名数据",
        description=description.strip() or None,
        type=DatasetType.vector,
        status=DatasetStatus.processing,
        source_filename=filename,
        size_bytes=len(content),
        fields=[],
        statistics={},
        style={},
    )
    db.add(dataset)
    await db.flush()
    base_key = f"{workspace_id}/{dataset.id}"
    source_key = f"{base_key}/source{suffix or '.geojson'}"
    preview_key = f"{base_key}/preview.tif" if suffix in {".tif", ".tiff"} else f"{base_key}/preview.geojson"
    upload_keys = [source_key, preview_key]

    def cleanup_upload_objects() -> None:
        try:
            storage.delete_many(upload_keys)
        except Exception:
            # Cleanup must never hide the original parsing or database error.
            pass

    try:
        result = ingest_file(filename, content, dataset.id, workspace_id, epsg, storage)
        dataset.type = result.type
        dataset.status = DatasetStatus.ready
        dataset.geometry_type = result.geometry_type
        dataset.source_crs = result.source_crs
        dataset.bounds = result.bounds
        dataset.footprint = func.ST_GeomFromText(result.footprint_wkt, 4326)
        dataset.fields = result.fields
        dataset.statistics = result.statistics
        dataset.preview_key = result.preview_key
        dataset.source_key = result.source_key
        dataset.feature_count = result.feature_count
        dataset.media_type = result.media_type
    except Exception as exc:
        cleanup_upload_objects()
        dataset.status = DatasetStatus.failed
        dataset.error_message = str(exc)[:4000]
        try:
            await db.commit()
        except Exception:
            await db.rollback()
        raise HTTPException(status_code=422, detail=f"文件解析失败：{exc}") from exc

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        cleanup_upload_objects()
        raise HTTPException(
            status_code=500,
            detail="数据已解析，但元数据保存失败；临时文件已自动清理",
        ) from exc
    await db.refresh(dataset)
    dataset.owner = user
    return _dataset_out(dataset)


@router.patch("/datasets/{dataset_id}", response_model=DatasetOut)
async def patch_dataset(payload: DatasetPatch, dataset_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> DatasetOut:
    dataset = await db.scalar(
        select(Dataset).options(selectinload(Dataset.owner)).where(Dataset.id == dataset_id)
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="数据集不存在")
    await _editable_membership(db, dataset.workspace_id, user.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(dataset, key, value)
    await db.commit()
    await db.refresh(dataset)
    return _dataset_out(dataset)


@router.delete("/datasets/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), storage: ObjectStorage = Depends(get_storage)) -> None:
    dataset = await db.scalar(select(Dataset).where(Dataset.id == dataset_id))
    if not dataset:
        raise HTTPException(status_code=404, detail="数据集不存在")
    await _editable_membership(db, dataset.workspace_id, user.id)
    storage.delete_many([dataset.source_key or "", dataset.preview_key or ""])
    await db.delete(dataset)
    await db.commit()


@router.get("/datasets/{dataset_id}/preview")
async def dataset_preview(dataset_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), storage: ObjectStorage = Depends(get_storage)) -> StreamingResponse:
    dataset = await db.scalar(select(Dataset).where(Dataset.id == dataset_id))
    if not dataset or not dataset.preview_key:
        raise HTTPException(status_code=404, detail="预览数据不存在")
    await _membership(db, dataset.workspace_id, user.id)
    headers = {
        "Cache-Control": "private, max-age=86400",
        "Content-Length": str(storage.object_size(dataset.preview_key)),
    }
    return StreamingResponse(
        storage.stream(dataset.preview_key),
        media_type="application/geo+json" if dataset.type.value == "vector" else "image/tiff",
        headers=headers,
    )


@router.get("/datasets/{dataset_id}/download")
async def dataset_download(dataset_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), storage: ObjectStorage = Depends(get_storage)) -> StreamingResponse:
    dataset = await db.scalar(select(Dataset).where(Dataset.id == dataset_id))
    if not dataset or not dataset.source_key:
        raise HTTPException(status_code=404, detail="源文件不存在")
    await _membership(db, dataset.workspace_id, user.id)
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(dataset.source_filename)}"}
    return StreamingResponse(storage.stream(dataset.source_key), media_type=dataset.media_type or "application/octet-stream", headers=headers)


@router.get("/workspaces/{workspace_id}/identify")
async def identify(
    workspace_id: uuid.UUID,
    lng: float = Query(ge=-180, le=180),
    lat: float = Query(ge=-90, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _membership(db, workspace_id, user.id)
    point = func.ST_SetSRID(func.ST_Point(lng, lat), 4326)
    regions = (
        await db.execute(
            select(AdminRegion, func.ST_AsGeoJSON(AdminRegion.geom))
            .where(func.ST_Intersects(AdminRegion.geom, point))
            .order_by(func.ST_Area(AdminRegion.geom))
            .limit(2)
        )
    ).all()
    region = None
    selection_geom = point
    if regions:
        leaf, geojson = regions[0]
        parent = regions[1][0] if len(regions) > 1 else None
        region = {
            "adcode": leaf.adcode,
            "name": leaf.name,
            "level": leaf.level,
            "parent": parent.name if parent else None,
            "geometry": __import__("json").loads(geojson),
        }
        selection_geom = leaf.geom
    datasets = (
        await db.scalars(
            select(Dataset)
            .options(selectinload(Dataset.owner))
            .where(
                Dataset.workspace_id == workspace_id,
                Dataset.status == DatasetStatus.ready,
                func.ST_Intersects(Dataset.footprint, selection_geom),
            )
            .order_by(Dataset.created_at.desc())
        )
    ).all()
    return {
        "region": region,
        "datasets": [_dataset_out(dataset).model_dump(mode="json") for dataset in datasets],
        "point": {"lat": lat, "lng": lng},
    }

