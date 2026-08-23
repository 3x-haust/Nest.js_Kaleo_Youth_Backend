import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ABOUT_PAGE_ID = '00000000-0000-4000-8000-000000000001';

export interface AboutValue {
  readonly icon: string;
  readonly label: string;
  readonly title: string;
  readonly body: string;
}

/** Public About content has exactly one row, addressed by ABOUT_PAGE_ID. */
@Entity('about_page')
export class AboutPage {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'intro_eyebrow', type: 'varchar', length: 50 })
  introEyebrow: string;

  @Column({ name: 'intro_title', type: 'varchar', length: 150 })
  introTitle: string;

  @Column({ name: 'intro_body', type: 'text' })
  introBody: string;

  @Column({ type: 'jsonb' })
  values: AboutValue[];

  @Column({ name: 'leader_eyebrow', type: 'varchar', length: 50 })
  leaderEyebrow: string;

  @Column({ name: 'leader_name', type: 'varchar', length: 50 })
  leaderName: string;

  @Column({ name: 'leader_role', type: 'varchar', length: 100 })
  leaderRole: string;

  @Column({ name: 'leader_body', type: 'text' })
  leaderBody: string;

  @Column({
    name: 'leader_photo_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  leaderPhotoUrl: string | null;

  @Column({ name: 'team_eyebrow', type: 'varchar', length: 50 })
  teamEyebrow: string;

  @Column({
    name: 'closing_photo_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  closingPhotoUrl: string | null;

  @Column({ name: 'closing_photo_label', type: 'varchar', length: 150 })
  closingPhotoLabel: string;

  @Column({ name: 'closing_lines', type: 'jsonb' })
  closingLines: string[];

  @Column({ name: 'closing_label', type: 'varchar', length: 100 })
  closingLabel: string;

  @Column({ name: 'meta_title', type: 'varchar', length: 100 })
  metaTitle: string;

  @Column({ name: 'meta_description', type: 'varchar', length: 300 })
  metaDescription: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
