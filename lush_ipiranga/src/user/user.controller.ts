import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/response-user.dto'; // Novo DTO
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiCreatedResponse({
    description: 'Usuário criado com sucesso',
    type: UserResponseDto,
  }) // Atualizado
  @ApiBadRequestResponse({
    description: 'Erro de validação ou falha ao criar usuário',
  })
  async create(@Body() createUserDto: CreateUserDto) {
    try {
      const createdUser = await this.userService.createUser(createUserDto);
      return createdUser; // Este já deve ser um UserResponseDto
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(
          `Failed to create user: ${error.message}`,
        );
      }
      throw new BadRequestException('Failed to create user: erro desconhecido');
    }
  }

  @Put(':id')
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiOkResponse({
    description: 'Usuário atualizado com sucesso',
    type: UserResponseDto,
  }) // Atualizado
  @ApiBadRequestResponse({
    description: 'Erro de validação ou falha ao atualizar usuário',
  })
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    try {
      const updatedUser = await this.userService.updateUser(
        Number(id),
        updateUserDto,
      );
      return updatedUser; // Este já deve ser um UserResponseDto
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(
          `Failed to create user: ${error.message}`,
        );
      }
      throw new BadRequestException(`Failed to update user: erro desconhecido`);
    }
  }

  @Get('/all')
  @ApiOkResponse({
    description: 'Lista de todos os usuários',
    type: [UserResponseDto],
  }) // Atualizado
  @ApiBadRequestResponse({ description: 'Erro ao buscar usuários' })
  async findAll() {
    try {
      const users = await this.userService.findAll();
      return users; // Este já deve ser um array de UserResponseDto
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(
          `Failed to create user: ${error.message}`,
        );
      }
      throw new BadRequestException('Failed to fetch users: erro desconhecido');
    }
  }

  @Get('email/:email')
  @ApiParam({ name: 'email', description: 'Email do usuário' })
  @ApiOkResponse({ description: 'Usuário encontrado', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Usuário não encontrado' })
  async findByEmail(@Param('email') email: string) {
    try {
      const user = await this.userService.findByEmail(email);
      return user;
    } catch (error) {
      throw new NotFoundException(`User with email ${email} not found`);
    }
  }

  @Delete(':id')
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiOkResponse({ description: 'Usuário deletado com sucesso' })
  @ApiBadRequestResponse({ description: 'Erro ao deletar usuário' })
  async delete(@Param('id') id: string) {
    try {
      await this.userService.deleteUser(Number(id));
      return { message: `User with ID ${id} deleted successfully` };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException(`Failed to delete user: erro desconhecido`);
    }
  }
}
