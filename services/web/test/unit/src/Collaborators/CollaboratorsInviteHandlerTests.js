const sinon = require('sinon')
const { expect } = require('chai')
const SandboxedModule = require('sandboxed-module')
const { ObjectId } = require('mongodb')
const Crypto = require('crypto')
const Errors = require('../../../../app/src/Features/Errors/Errors')

const MODULE_PATH =
  '../../../../app/src/Features/Collaborators/CollaboratorsInviteHandler.js'

describe('CollaboratorsInviteHandler', function () {
  beforeEach(function () {
    this.ProjectInvite = class ProjectInvite {
      constructor(options) {
        if (options == null) {
          options = {}
        }
        this._id = ObjectId()
        for (const k in options) {
          const v = options[k]
          this[k] = v
        }
      }
    }
    this.ProjectInvite.prototype.save = sinon.stub()
    this.ProjectInvite.findOne = sinon.stub()
    this.ProjectInvite.find = sinon.stub()
    this.ProjectInvite.deleteOne = sinon.stub()
    this.ProjectInvite.countDocuments = sinon.stub()

    this.Crypto = {
      randomBytes: sinon.stub().callsFake(Crypto.randomBytes),
    }
    this.settings = {}
    this.CollaboratorsEmailHandler = { promises: {} }
    this.CollaboratorsHandler = {
      promises: {
        addUserIdToProject: sinon.stub(),
      },
    }
    this.UserGetter = { promises: { getUser: sinon.stub() } }
    this.ProjectGetter = { promises: {} }
    this.NotificationsBuilder = { promises: {} }

    this.CollaboratorsInviteHandler = SandboxedModule.require(MODULE_PATH, {
      requires: {
        '@overleaf/settings': this.settings,
        '../../models/ProjectInvite': { ProjectInvite: this.ProjectInvite },
        './CollaboratorsEmailHandler': this.CollaboratorsEmailHandler,
        './CollaboratorsHandler': this.CollaboratorsHandler,
        '../User/UserGetter': this.UserGetter,
        '../Project/ProjectGetter': this.ProjectGetter,
        '../Notifications/NotificationsBuilder': this.NotificationsBuilder,
        crypto: this.Crypto,
      },
    })

    this.projectId = ObjectId()
    this.sendingUserId = ObjectId()
    this.sendingUser = {
      _id: this.sendingUserId,
      name: 'Bob',
    }
    this.email = 'user@example.com'
    this.userId = ObjectId()
    this.user = {
      _id: this.userId,
      email: 'someone@example.com',
    }
    this.inviteId = ObjectId()
    this.token = 'hnhteaosuhtaeosuahs'
    this.privileges = 'readAndWrite'
    this.fakeInvite = {
      _id: this.inviteId,
      email: this.email,
      token: this.token,
      sendingUserId: this.sendingUserId,
      projectId: this.projectId,
      privileges: this.privileges,
      createdAt: new Date(),
    }
  })

  describe('getInviteCount', function () {
    beforeEach(function () {
      this.ProjectInvite.countDocuments.returns({
        exec: sinon.stub().resolves(2),
      })
      this.call = async () => {
        return await this.CollaboratorsInviteHandler.promises.getInviteCount(
          this.projectId
        )
      }
    })

    it('should produce the count of documents', async function () {
      const count = await this.call()
      expect(count).to.equal(2)
    })

    describe('when model.countDocuments produces an error', function () {
      beforeEach(function () {
        this.ProjectInvite.countDocuments.returns({
          exec: sinon.stub().rejects(new Error('woops')),
        })
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })
    })
  })

  describe('getAllInvites', function () {
    beforeEach(function () {
      this.fakeInvites = [
        { _id: ObjectId(), one: 1 },
        { _id: ObjectId(), two: 2 },
      ]
      this.ProjectInvite.find.returns({
        exec: sinon.stub().resolves(this.fakeInvites),
      })
      this.call = async () => {
        return await this.CollaboratorsInviteHandler.promises.getAllInvites(
          this.projectId
        )
      }
    })

    describe('when all goes well', function () {
      beforeEach(function () {})

      it('should produce a list of invite objects', async function () {
        const invites = await this.call()
        expect(invites).to.not.be.oneOf([null, undefined])
        expect(invites).to.deep.equal(this.fakeInvites)
      })

      it('should have called ProjectInvite.find', async function () {
        await this.call()
        this.ProjectInvite.find.callCount.should.equal(1)
        this.ProjectInvite.find
          .calledWith({ projectId: this.projectId })
          .should.equal(true)
      })
    })

    describe('when ProjectInvite.find produces an error', function () {
      beforeEach(function () {
        this.ProjectInvite.find.returns({
          exec: sinon.stub().rejects(new Error('woops')),
        })
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })
    })
  })

  describe('inviteToProject', function () {
    beforeEach(function () {
      this.ProjectInvite.prototype.save.callsFake(async function () {
        return this
      })
      this.CollaboratorsInviteHandler.promises._sendMessages = sinon
        .stub()
        .resolves()
      this.call = async () => {
        return await this.CollaboratorsInviteHandler.promises.inviteToProject(
          this.projectId,
          this.sendingUser,
          this.email,
          this.privileges
        )
      }
    })

    describe('when all goes well', function () {
      beforeEach(function () {})

      it('should produce the invite object', async function () {
        const invite = await this.call()
        expect(invite).to.not.equal(null)
        expect(invite).to.not.equal(undefined)
        expect(invite).to.be.instanceof(Object)
        expect(invite).to.have.all.keys([
          '_id',
          'email',
          'token',
          'sendingUserId',
          'projectId',
          'privileges',
        ])
      })

      it('should have generated a random token', async function () {
        await this.call()
        this.Crypto.randomBytes.callCount.should.equal(1)
      })

      it('should have called ProjectInvite.save', async function () {
        await this.call()
        this.ProjectInvite.prototype.save.callCount.should.equal(1)
      })

      it('should have called _sendMessages', async function () {
        await this.call()
        this.CollaboratorsInviteHandler.promises._sendMessages.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteHandler.promises._sendMessages
          .calledWith(this.projectId, this.sendingUser)
          .should.equal(true)
      })
    })

    describe('when saving model produces an error', function () {
      beforeEach(function () {
        this.ProjectInvite.prototype.save.rejects(new Error('woops'))
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })
    })
  })

  describe('_sendMessages', function () {
    beforeEach(function () {
      this.CollaboratorsEmailHandler.promises.notifyUserOfProjectInvite = sinon
        .stub()
        .resolves()
      this.CollaboratorsInviteHandler.promises._trySendInviteNotification =
        sinon.stub().resolves()
      this.call = async () => {
        await this.CollaboratorsInviteHandler.promises._sendMessages(
          this.projectId,
          this.sendingUser,
          this.fakeInvite
        )
      }
    })

    describe('when all goes well', function () {
      it('should call CollaboratorsEmailHandler.notifyUserOfProjectInvite', async function () {
        await this.call()
        this.CollaboratorsEmailHandler.promises.notifyUserOfProjectInvite.callCount.should.equal(
          1
        )
        this.CollaboratorsEmailHandler.promises.notifyUserOfProjectInvite
          .calledWith(this.projectId, this.fakeInvite.email, this.fakeInvite)
          .should.equal(true)
      })

      it('should call _trySendInviteNotification', async function () {
        await this.call()
        this.CollaboratorsInviteHandler.promises._trySendInviteNotification.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteHandler.promises._trySendInviteNotification
          .calledWith(this.projectId, this.sendingUser, this.fakeInvite)
          .should.equal(true)
      })
    })

    describe('when CollaboratorsEmailHandler.notifyUserOfProjectInvite produces an error', function () {
      beforeEach(function () {
        this.CollaboratorsEmailHandler.promises.notifyUserOfProjectInvite =
          sinon.stub().rejects(new Error('woops'))
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })

      it('should not call _trySendInviteNotification', async function () {
        await expect(this.call()).to.be.rejected
        this.CollaboratorsInviteHandler.promises._trySendInviteNotification.callCount.should.equal(
          0
        )
      })
    })

    describe('when _trySendInviteNotification produces an error', function () {
      beforeEach(function () {
        this.CollaboratorsInviteHandler.promises._trySendInviteNotification =
          sinon.stub().rejects(new Error('woops'))
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })
    })
  })

  describe('revokeInvite', function () {
    beforeEach(function () {
      this.ProjectInvite.deleteOne.returns({
        exec: sinon.stub().resolves(),
      })
      this.CollaboratorsInviteHandler.promises._tryCancelInviteNotification =
        sinon.stub().resolves()
      this.call = async () => {
        await this.CollaboratorsInviteHandler.promises.revokeInvite(
          this.projectId,
          this.inviteId
        )
      }
    })

    describe('when all goes well', function () {
      beforeEach(function () {})

      it('should call ProjectInvite.deleteOne', async function () {
        await this.call()
        this.ProjectInvite.deleteOne.callCount.should.equal(1)
        this.ProjectInvite.deleteOne
          .calledWith({ projectId: this.projectId, _id: this.inviteId })
          .should.equal(true)
      })

      it('should call _tryCancelInviteNotification', async function () {
        await this.call()
        this.CollaboratorsInviteHandler.promises._tryCancelInviteNotification.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteHandler.promises._tryCancelInviteNotification
          .calledWith(this.inviteId)
          .should.equal(true)
      })
    })

    describe('when remove produces an error', function () {
      beforeEach(function () {
        this.ProjectInvite.deleteOne.returns({
          exec: sinon.stub().rejects(new Error('woops')),
        })
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })
    })
  })

  describe('resendInvite', function () {
    beforeEach(function () {
      this.ProjectInvite.findOne.returns({
        exec: sinon.stub().resolves(this.fakeInvite),
      })
      this.CollaboratorsInviteHandler.promises._sendMessages = sinon
        .stub()
        .resolves()
      this.call = async () => {
        await this.CollaboratorsInviteHandler.promises.resendInvite(
          this.projectId,
          this.sendingUser,
          this.inviteId
        )
      }
    })

    describe('when all goes well', function () {
      beforeEach(function () {})

      it('should call ProjectInvite.findOne', async function () {
        await this.call()
        this.ProjectInvite.findOne.callCount.should.equal(1)
        this.ProjectInvite.findOne
          .calledWith({ _id: this.inviteId, projectId: this.projectId })
          .should.equal(true)
      })

      it('should have called _sendMessages', async function () {
        await this.call()
        this.CollaboratorsInviteHandler.promises._sendMessages.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteHandler.promises._sendMessages
          .calledWith(this.projectId, this.sendingUser, this.fakeInvite)
          .should.equal(true)
      })
    })

    describe('when findOne produces an error', function () {
      beforeEach(function () {
        this.ProjectInvite.findOne.returns({
          exec: sinon.stub().rejects(new Error('woops')),
        })
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })

      it('should not have called _sendMessages', async function () {
        await expect(this.call()).to.be.rejected
        this.CollaboratorsInviteHandler.promises._sendMessages.callCount.should.equal(
          0
        )
      })
    })

    describe('when findOne does not find an invite', function () {
      beforeEach(function () {
        this.ProjectInvite.findOne.returns({
          exec: sinon.stub().resolves(null),
        })
      })

      it('should not have called _sendMessages', async function () {
        await this.call()
        this.CollaboratorsInviteHandler.promises._sendMessages.callCount.should.equal(
          0
        )
      })
    })
  })

  describe('getInviteByToken', function () {
    beforeEach(function () {
      this.ProjectInvite.findOne.returns({
        exec: sinon.stub().resolves(this.fakeInvite),
      })
      this.call = async () => {
        return await this.CollaboratorsInviteHandler.promises.getInviteByToken(
          this.projectId,
          this.token
        )
      }
    })

    describe('when all goes well', function () {
      it('should produce the invite object', async function () {
        const invite = await this.call()
        expect(invite).to.deep.equal(this.fakeInvite)
      })

      it('should call ProjectInvite.findOne', async function () {
        await this.call()
        this.ProjectInvite.findOne.callCount.should.equal(1)
        this.ProjectInvite.findOne
          .calledWith({ projectId: this.projectId, token: this.token })
          .should.equal(true)
      })
    })

    describe('when findOne produces an error', function () {
      beforeEach(function () {
        this.ProjectInvite.findOne.returns({
          exec: sinon.stub().rejects(new Error('woops')),
        })
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })
    })

    describe('when findOne does not find an invite', function () {
      beforeEach(function () {
        this.ProjectInvite.findOne.returns({
          exec: sinon.stub().resolves(null),
        })
      })

      it('should not produce an invite object', async function () {
        const invite = await this.call()
        expect(invite).to.be.oneOf([null, undefined])
      })
    })
  })

  describe('acceptInvite', function () {
    beforeEach(function () {
      this.fakeProject = {
        _id: this.projectId,
        collaberator_refs: [],
        readOnly_refs: [],
      }
      this.CollaboratorsHandler.promises.addUserIdToProject.resolves()
      this._getInviteByToken = sinon.stub(
        this.CollaboratorsInviteHandler.promises,
        'getInviteByToken'
      )
      this._getInviteByToken.resolves(this.fakeInvite)
      this.CollaboratorsInviteHandler.promises._tryCancelInviteNotification =
        sinon.stub().resolves()
      this.ProjectInvite.deleteOne.returns({ exec: sinon.stub().resolves() })
      this.call = async () => {
        await this.CollaboratorsInviteHandler.promises.acceptInvite(
          this.projectId,
          this.token,
          this.user
        )
      }
    })

    afterEach(function () {
      this._getInviteByToken.restore()
    })

    describe('when all goes well', function () {
      it('should have called getInviteByToken', async function () {
        await this.call()
        this._getInviteByToken.callCount.should.equal(1)
        this._getInviteByToken
          .calledWith(this.projectId, this.token)
          .should.equal(true)
      })

      it('should have called CollaboratorsHandler.addUserIdToProject', async function () {
        await this.call()
        this.CollaboratorsHandler.promises.addUserIdToProject.callCount.should.equal(
          1
        )
        this.CollaboratorsHandler.promises.addUserIdToProject
          .calledWith(
            this.projectId,
            this.sendingUserId,
            this.userId,
            this.fakeInvite.privileges
          )
          .should.equal(true)
      })

      it('should have called ProjectInvite.deleteOne', async function () {
        await this.call()
        this.ProjectInvite.deleteOne.callCount.should.equal(1)
        this.ProjectInvite.deleteOne
          .calledWith({ _id: this.inviteId })
          .should.equal(true)
      })
    })

    describe('when the invite is for readOnly access', function () {
      beforeEach(function () {
        this.fakeInvite.privileges = 'readOnly'
        this._getInviteByToken.resolves(this.fakeInvite)
      })

      it('should have called CollaboratorsHandler.addUserIdToProject', async function () {
        await this.call()
        this.CollaboratorsHandler.promises.addUserIdToProject.callCount.should.equal(
          1
        )
        this.CollaboratorsHandler.promises.addUserIdToProject
          .calledWith(
            this.projectId,
            this.sendingUserId,
            this.userId,
            this.fakeInvite.privileges
          )
          .should.equal(true)
      })
    })

    describe('when getInviteByToken does not find an invite', function () {
      beforeEach(function () {
        this._getInviteByToken.resolves(null)
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Errors.NotFoundError)
      })

      it('should have called getInviteByToken', async function () {
        await expect(this.call()).to.be.rejected
        this._getInviteByToken.callCount.should.equal(1)
        this._getInviteByToken
          .calledWith(this.projectId, this.token)
          .should.equal(true)
      })

      it('should not have called CollaboratorsHandler.addUserIdToProject', async function () {
        await expect(this.call()).to.be.rejected
        this.CollaboratorsHandler.promises.addUserIdToProject.callCount.should.equal(
          0
        )
      })

      it('should not have called ProjectInvite.deleteOne', async function () {
        await expect(this.call()).to.be.rejected
        this.ProjectInvite.deleteOne.callCount.should.equal(0)
      })
    })

    describe('when getInviteByToken produces an error', function () {
      beforeEach(function () {
        this._getInviteByToken.rejects(new Error('woops'))
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })

      it('should have called getInviteByToken', async function () {
        await expect(this.call()).to.be.rejected
        this._getInviteByToken.callCount.should.equal(1)
        this._getInviteByToken
          .calledWith(this.projectId, this.token)
          .should.equal(true)
      })

      it('should not have called CollaboratorsHandler.addUserIdToProject', async function () {
        await expect(this.call()).to.be.rejected
        this.CollaboratorsHandler.promises.addUserIdToProject.callCount.should.equal(
          0
        )
      })

      it('should not have called ProjectInvite.deleteOne', async function () {
        await expect(this.call()).to.be.rejected
        this.ProjectInvite.deleteOne.callCount.should.equal(0)
      })
    })

    describe('when addUserIdToProject produces an error', function () {
      beforeEach(function () {
        this.CollaboratorsHandler.promises.addUserIdToProject.callsArgWith(
          4,
          new Error('woops')
        )
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })

      it('should have called getInviteByToken', async function () {
        await expect(this.call()).to.be.rejected
        this._getInviteByToken.callCount.should.equal(1)
        this._getInviteByToken
          .calledWith(this.projectId, this.token)
          .should.equal(true)
      })

      it('should have called CollaboratorsHandler.addUserIdToProject', async function () {
        await expect(this.call()).to.be.rejected
        this.CollaboratorsHandler.promises.addUserIdToProject.callCount.should.equal(
          1
        )
        this.CollaboratorsHandler.promises.addUserIdToProject
          .calledWith(
            this.projectId,
            this.sendingUserId,
            this.userId,
            this.fakeInvite.privileges
          )
          .should.equal(true)
      })

      it('should not have called ProjectInvite.deleteOne', async function () {
        await expect(this.call()).to.be.rejected
        this.ProjectInvite.deleteOne.callCount.should.equal(0)
      })
    })

    describe('when ProjectInvite.deleteOne produces an error', function () {
      beforeEach(function () {
        this.ProjectInvite.deleteOne.returns({
          exec: sinon.stub().rejects(new Error('woops')),
        })
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })

      it('should have called getInviteByToken', async function () {
        await expect(this.call()).to.be.rejected
        this._getInviteByToken.callCount.should.equal(1)
        this._getInviteByToken
          .calledWith(this.projectId, this.token)
          .should.equal(true)
      })

      it('should have called CollaboratorsHandler.addUserIdToProject', async function () {
        await expect(this.call()).to.be.rejected
        this.CollaboratorsHandler.promises.addUserIdToProject.callCount.should.equal(
          1
        )
        this.CollaboratorsHandler.promises.addUserIdToProject
          .calledWith(
            this.projectId,
            this.sendingUserId,
            this.userId,
            this.fakeInvite.privileges
          )
          .should.equal(true)
      })

      it('should have called ProjectInvite.deleteOne', async function () {
        await expect(this.call()).to.be.rejected
        this.ProjectInvite.deleteOne.callCount.should.equal(1)
      })
    })
  })

  describe('_tryCancelInviteNotification', function () {
    beforeEach(function () {
      this.inviteId = ObjectId()
      this.currentUser = { _id: ObjectId() }
      this.notification = { read: sinon.stub().resolves() }
      this.NotificationsBuilder.promises.projectInvite = sinon
        .stub()
        .returns(this.notification)
      this.call = async () => {
        await this.CollaboratorsInviteHandler.promises._tryCancelInviteNotification(
          this.inviteId
        )
      }
    })

    it('should call notification.read', async function () {
      await this.call()
      this.notification.read.callCount.should.equal(1)
    })

    describe('when notification.read produces an error', function () {
      beforeEach(function () {
        this.notification = {
          read: sinon.stub().rejects(new Error('woops')),
        }
        this.NotificationsBuilder.promises.projectInvite = sinon
          .stub()
          .returns(this.notification)
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejected
      })
    })
  })

  describe('_trySendInviteNotification', function () {
    beforeEach(function () {
      this.invite = {
        _id: ObjectId(),
        token: 'some_token',
        sendingUserId: ObjectId(),
        projectId: this.project_id,
        targetEmail: 'user@example.com',
        createdAt: new Date(),
      }
      this.sendingUser = {
        _id: ObjectId(),
        first_name: 'jim',
      }
      this.existingUser = { _id: ObjectId() }
      this.UserGetter.promises.getUserByAnyEmail = sinon
        .stub()
        .resolves(this.existingUser)
      this.fakeProject = {
        _id: this.project_id,
        name: 'some project',
      }
      this.ProjectGetter.promises.getProject = sinon
        .stub()
        .resolves(this.fakeProject)
      this.notification = { create: sinon.stub().resolves() }
      this.NotificationsBuilder.promises.projectInvite = sinon
        .stub()
        .returns(this.notification)
      this.call = async () => {
        await this.CollaboratorsInviteHandler.promises._trySendInviteNotification(
          this.project_id,
          this.sendingUser,
          this.invite
        )
      }
    })

    describe('when the user exists', function () {
      beforeEach(function () {})

      it('should call getUser', async function () {
        await this.call()
        this.UserGetter.promises.getUserByAnyEmail.callCount.should.equal(1)
        this.UserGetter.promises.getUserByAnyEmail
          .calledWith(this.invite.email)
          .should.equal(true)
      })

      it('should call getProject', async function () {
        await this.call()
        this.ProjectGetter.promises.getProject.callCount.should.equal(1)
        this.ProjectGetter.promises.getProject
          .calledWith(this.project_id)
          .should.equal(true)
      })

      it('should call NotificationsBuilder.projectInvite.create', async function () {
        await this.call()
        this.NotificationsBuilder.promises.projectInvite.callCount.should.equal(
          1
        )
        this.notification.create.callCount.should.equal(1)
      })

      describe('when getProject produces an error', function () {
        beforeEach(function () {
          this.ProjectGetter.promises.getProject.callsArgWith(
            2,
            new Error('woops')
          )
        })

        it('should produce an error', async function () {
          await expect(this.call()).to.be.rejectedWith(Error)
        })

        it('should not call NotificationsBuilder.projectInvite.create', async function () {
          await expect(this.call()).to.be.rejected
          this.NotificationsBuilder.promises.projectInvite.callCount.should.equal(
            0
          )
          this.notification.create.callCount.should.equal(0)
        })
      })

      describe('when projectInvite.create produces an error', function () {
        beforeEach(function () {
          this.notification.create.callsArgWith(0, new Error('woops'))
        })

        it('should produce an error', async function () {
          await expect(this.call()).to.be.rejectedWith(Error)
        })
      })
    })

    describe('when the user does not exist', function () {
      beforeEach(function () {
        this.UserGetter.promises.getUserByAnyEmail = sinon.stub().resolves(null)
      })

      it('should call getUser', async function () {
        await this.call()
        this.UserGetter.promises.getUserByAnyEmail.callCount.should.equal(1)
        this.UserGetter.promises.getUserByAnyEmail
          .calledWith(this.invite.email)
          .should.equal(true)
      })

      it('should not call getProject', async function () {
        await this.call()
        this.ProjectGetter.promises.getProject.callCount.should.equal(0)
      })

      it('should not call NotificationsBuilder.projectInvite.create', async function () {
        await this.call()
        this.NotificationsBuilder.promises.projectInvite.callCount.should.equal(
          0
        )
        this.notification.create.callCount.should.equal(0)
      })
    })

    describe('when the getUser produces an error', function () {
      beforeEach(function () {
        this.UserGetter.promises.getUserByAnyEmail = sinon
          .stub()
          .rejects(new Error('woops'))
      })

      it('should produce an error', async function () {
        await expect(this.call()).to.be.rejectedWith(Error)
      })

      it('should call getUser', async function () {
        await expect(this.call()).to.be.rejected
        this.UserGetter.promises.getUserByAnyEmail.callCount.should.equal(1)
        this.UserGetter.promises.getUserByAnyEmail
          .calledWith(this.invite.email)
          .should.equal(true)
      })

      it('should not call getProject', async function () {
        await expect(this.call()).to.be.rejected
        this.ProjectGetter.promises.getProject.callCount.should.equal(0)
      })

      it('should not call NotificationsBuilder.projectInvite.create', async function () {
        await expect(this.call()).to.be.rejected
        this.NotificationsBuilder.promises.projectInvite.callCount.should.equal(
          0
        )
        this.notification.create.callCount.should.equal(0)
      })
    })
  })
})
