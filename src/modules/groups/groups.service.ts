import { Injectable } from '@nestjs/common';
import { groupService } from './group.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { RenameGroupDto } from './dto/rename-group.dto';
import { AddGroupMembersDto } from './dto/add-group-members.dto';

// Delegates straight to the existing groupService - its NotFoundError /
// ConflictError (from utils/AppError) are already handled generically by
// AllExceptionsFilter (instanceof AppError branch), so no re-throwing as
// Nest exceptions is needed here.
@Injectable()
export class GroupsService {
  list() {
    return groupService.list();
  }

  getById(id: number) {
    return groupService.getById(id);
  }

  create(dto: CreateGroupDto, createdBy: number) {
    return groupService.create(dto.name, createdBy);
  }

  rename(id: number, dto: RenameGroupDto) {
    return groupService.rename(id, dto.name);
  }

  remove(id: number) {
    return groupService.remove(id);
  }

  addMembers(id: number, dto: AddGroupMembersDto, addedBy: number) {
    return groupService.addMembers(id, dto.userIds, addedBy);
  }

  removeMember(id: number, userId: number) {
    return groupService.removeMember(id, userId);
  }
}
