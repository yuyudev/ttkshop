import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { MockPrismaService } from '../utils/mock-prisma.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TiktokShopService } from '../../src/auth/tiktokshop.service';
import { TiktokShopController } from '../../src/auth/tiktokshop.controller';
import { ensureTestEnv } from '../utils/test-env';

describe('OAuth Callback (controller)', () => {
  let app: INestApplication;
  const prisma = new MockPrismaService();
  const exchangeMock = jest.fn();
  let controller: TiktokShopController;

  beforeAll(async () => {
    ensureTestEnv();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(TiktokShopService)
      .useValue({
        exchangeAuthorizationCode: exchangeMock.mockResolvedValue({
          shopId: 'shop123',
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    controller = app.get(TiktokShopController);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    exchangeMock.mockClear();
  });

  it('redirects after exchanging the auth code', async () => {
    const state = Buffer.from(JSON.stringify({ shopId: 'shop123' })).toString('base64');
    const redirectMock = jest.fn();
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn().mockReturnThis();
    const res: any = {
      redirect: redirectMock,
      status: statusMock,
      json: jsonMock,
    };

    await controller.callback(
      res,
      {
        auth_code: 'abc123',
        state,
      } as any,
    );

    expect(redirectMock).toHaveBeenCalledWith(
      302,
      'https://ttsscoremedia.com.br/oauth/tiktokshop/callback/success',
    );
    expect(exchangeMock).toHaveBeenCalledWith('abc123', 'shop123');
  });
});
