"""Initial migration

Revision ID: 001
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('clerk_user_id', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('first_name', sa.String(100), nullable=True),
        sa.Column('last_name', sa.String(100), nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_users_clerk_id', 'users', ['clerk_user_id'])

    # Documents table
    op.create_table(
        'documents',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(255), nullable=False, index=True),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('original_filename', sa.String(500), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.Column('page_count', sa.Integer(), default=0, nullable=False),
        sa.Column('chunk_count', sa.Integer(), default=0, nullable=False),
        sa.Column('status', sa.String(20), default='pending', nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_documents_user_created', 'documents', ['user_id', 'created_at'])
    op.create_index('ix_documents_status', 'documents', ['status'])

    # Document chunks table
    op.create_table(
        'document_chunks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('token_count', sa.Integer(), default=0, nullable=False),
        sa.Column('page_number', sa.Integer(), nullable=True),
        sa.Column('char_start', sa.Integer(), nullable=True),
        sa.Column('char_end', sa.Integer(), nullable=True),
        sa.Column('vector_id', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_chunks_document_index', 'document_chunks', ['document_id', 'chunk_index'])
    op.create_index('ix_chunks_vector_id', 'document_chunks', ['vector_id'])

    # Chat sessions table
    op.create_table(
        'chat_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(255), nullable=False, index=True),
        sa.Column('title', sa.String(500), default='New Chat', nullable=False),
        sa.Column('document_ids', sa.ARRAY(UUID(as_uuid=True)), default=list, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_sessions_user_updated', 'chat_sessions', ['user_id', 'updated_at'])

    # Chat messages table
    op.create_table(
        'chat_messages',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', UUID(as_uuid=True), sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('citations', sa.JSON(), default=list, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_messages_session_created', 'chat_messages', ['session_id', 'created_at'])


def downgrade() -> None:
    op.drop_table('chat_messages')
    op.drop_table('chat_sessions')
    op.drop_table('document_chunks')
    op.drop_table('documents')
    op.drop_table('users')