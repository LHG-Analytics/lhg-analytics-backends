// src/users/users.controller.ts

import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  UseGuards,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Users")
@Controller("users")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles("admin")
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles("admin", "gerente_geral")
  findAll() {
    return this.usersService.findAll();
  }

  @Get("email/:email")
  @Roles("admin", "gerente_geral")
  findByEmail(@Param("email") email: string) {
    return this.usersService.findByEmail(email);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() updateUserDto: any) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Param("id") id: string) {
    return this.usersService.remove(+id);
  }
}
