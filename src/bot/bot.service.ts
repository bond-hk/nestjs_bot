import { Injectable } from '@nestjs/common';
import {
  TelegrafTelegramService,
  TelegramActionHandler,
} from 'nestjs-telegraf';
import { ContextMessageUpdate } from 'telegraf';
var Airtable = require('airtable');

/**
 * Hi developer!
 * 
 * My apology that this is a dirty piece of working prototype written by me who isn't experienced with NodeJS and BE.
 * I believe there are a lot to rewrite and revamp, and here are a few TODOs that I'm aware of:
 * 
 * - separte UI and DB logic into separte lib / modules
 * - use Promise for DB calls?
 * - error handling (no error handling at all in this dirty version)
 * 
 * Feel free to do more to make it better.
 * Thanks for helping to make these codes prettier and more robust!
 * Please remove this message when you are done. 
 * 
 * 
 * /Gigi 
 * github: @ggho
 */

@Injectable()
export class BotService {
  constructor(
    private readonly telegrafTelegramService: TelegrafTelegramService,
    // private airtableBase, 
  ) { }


  //@future Put database logic in a separte lib module
  // Not sure how to handle dependency injection here.. /Gigi
  static createDb() {
    const airtableBase = new Airtable({apiKey: process.env.AIRTABLE_API_KEY}).base('appUW06bs08YxzVDM');
    return airtableBase;
  }

  //@future Put this under a utils lib
  static escapeForMarkdownV2(str) {
    if(typeof str !== 'string' && !(str instanceof String)) {
      return '';
    }
    return str.replace(/[\_\*\[\]\(\)\~\`\>\#\+\-\=\|\{\}\.\!]/g,'\\$&');
  }

  //@future Put these UI-relating stuff under a UI module
  static makeMainMenuKeyboard() {
    const keyboard = [
      [{
        text: '睇今期 Top ideas！',
        callback_data: '/browseIdeas',
      }],
      [{
        text: '有 idea? 出橋啦',
        callback_data: '/submitIdea',
      }],
  
    ];
    return { inline_keyboard: keyboard};
  }

  static makeDetailsPageTextContent(ideaRecord, actionRecords, selectedActionId?) {
    const strActionLines = actionRecords.reduce((acc, eachRec) => {
      if(eachRec.fields['Action Type'] === 'Downvote') {
        return acc;
      }
      return acc + `${eachRec.fields['Action Title']} - ${eachRec.fields['Count']} 人` + (selectedActionId === eachRec.id ?  ' (已選)' : '') + '\n';
    }, '');

    const strContent = 
`【${ideaRecord.fields['Idea Title']}】
💪已集合 ${ideaRecord.fields['Participation Count']} 名參與者
📍${ideaRecord.fields['Target Location']}
${ideaRecord.fields['Idea Statement']}
    
共有 ${ideaRecord.fields['Support Count']} 名支持者
${BotService.escapeForMarkdownV2(strActionLines)}` +
'\n\*' + (selectedActionId ? '你已回應。' : '你呢？幫定唔幫？') + '\*';

    return strContent;
  }

  static makeDetailsPageKeyboard(actionRecords, selectedActionId?) {
    const actionArr = actionRecords.map((eachAction) => {
      
      return [{
        text: eachAction.fields['Action Title'] + (eachAction.id === selectedActionId ? ' (已選取)' : ''), //@todo: mark (已選取) if already selected by user
        callback_data: `/respondIdea ${eachAction.id}`,
      }];
    });

    return { inline_keyboard: actionArr };
  }

  static makeLoadingKeyboard() {
    const key = [{
      text: 'Loading⋯ (請稍候)',
      callback_data: 'empty',
    }];
    return { inline_keyboard: [key]};
  }


  /* This decorator handle /start command */
  @TelegramActionHandler({ onStart: true })
  async onStart(ctx: ContextMessageUpdate) {
    const me = await this.telegrafTelegramService.getMe();
    // console.log(me);
    const message = 
`歡迎你 come 幫！
你想做咩？

/browseIdeas - 睇今期 Top ideas！
/submitIdea - 有 idea? 出橋啦`;
    await ctx.reply(BotService.escapeForMarkdownV2(message), {
      parse_mode: 'MarkdownV2',
      reply_markup: BotService.makeMainMenuKeyboard(),
    });
  }


  @TelegramActionHandler({ action: /^\/browseIdeas/ })
  protected async onBrowseIdeas(ctx: ContextMessageUpdate) {
    const base = BotService.createDb();
    base('Ideas').select({
      view: 'Grid view',
      pageSize: 10,
    }).firstPage(function(err, records) {
        if (err) { console.error(err); return; }

        const strRecords = records.reduce((acc, record, idx) => {
          const strRecord = 
`${idx + 1}\\. 【${record.fields['Idea Title']}】
💪${record.fields['Participation Count']} 人參與
📍${record.fields['Target Location']}
${record.fields['Idea Statement']}

`;
          return acc + strRecord;
        }, '');

        const fullMessage = 
`今期 Top Ideas
${strRecords}想參與或支持？點擊以下的連結查看更多。

你有 idea? 
/submitIdea \\- 出橋啦！
`;

        const actionArr = records.map((record, idx) => {
          return [{
            text: `查看更多 ${idx + 1}.【${record.fields['Idea Title']}】`,
            callback_data: `/getIdea ${record.id}`,
          }];
        });

        ctx.replyWithMarkdown(fullMessage, {
          parse_mode: 'MarkdownV2',
          reply_markup: {
            inline_keyboard: actionArr
          },
        });
    });
  }


  @TelegramActionHandler({ action: /^\/submitIdea/ })
  protected async onSubmitIdea(ctx: ContextMessageUpdate) {
    await ctx.replyWithMarkdown(BotService.escapeForMarkdownV2(`（todo: 一些鼓勵出橋的說話）出橋這裹：https://airtable.com/shrYwXgCML9aN2dI3`), {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[{
          text: '出橋',
          url: 'https://airtable.com/shrYwXgCML9aN2dI3',
        }]]
      },
    });
  }

  @TelegramActionHandler({ action: /^\/getIdea/ })
  protected async onGetIdea(ctx: ContextMessageUpdate) {
    const parts = ctx.update.callback_query.data.split(' ');
    const ideaId = parts.length > 1 ? parts[1] : null;
    console.log('getIdea with ID: ' + ideaId);

    // 1. Find Idea by by ID
    const base = BotService.createDb();
    base('Ideas').find(ideaId, function(err, record) {
      if (err) { console.error(err); return; }
      
      //2. Fetch all Actions (with titles and type) of this idea
      const filterStr = record.fields['Actions'].reduce((acc, recID) => {
        return `${acc}RECORD_ID() = '${recID}', `;
      }, 'OR(').slice(0, -2) + ')';

      base('Actions').select({
        view: 'Grid view',
        filterByFormula: filterStr,
        fields: ['Action Title', 'Action Type', 'Count', 'By Users'],
      }).firstPage(function(err, actionRecords) {
          if (err) { console.error(err); return; }
          
          // console.log(ctx.update);
          // const userId = 123;
          // const selectedActionId = actionRecords.find((eachAction) => {
          //   // rec.fields['By Users']

          //   const supportersId = eachAction.fields['By Users'] || [];
          //   return supportersId.find((eachSupporterId) => {
          //     console.log(eachSupporterId);
          //     return eachSupporterId === userId;
          //   });

          // });

          // console.log('selectedActionId: ');
          // console.log(selectedActionId);

          ctx.replyWithMarkdown(BotService.makeDetailsPageTextContent(record, actionRecords), {
            parse_mode: 'MarkdownV2',
            //@todo, add param lastSelectedActionId
            reply_markup: BotService.makeDetailsPageKeyboard(actionRecords)
          });
          ctx.answerCbQuery();
      });
      
    });
  }

  @TelegramActionHandler({ action: /^\/respondIdea/ })
  protected async onRespondIdea(ctx: ContextMessageUpdate) {
    const callbackDataParts = ctx.update.callback_query.data.split(' ');

    const selectedActionId = callbackDataParts[1];
    // console.log("ctx callback_query :");
    // console.log(ctx.update.callback_query);
    const user = ctx.update.callback_query.from;

    ctx.editMessageReplyMarkup(BotService.makeLoadingKeyboard());

    const base = BotService.createDb();
    //1. Fetch SelectedAction record 
    await base('Actions').find(selectedActionId, function(err, selectedActionRecord) {
      if (err) { console.error(err); return; }

      console.log('selected Action below:');
      console.log(selectedActionRecord.fields);
      const ideaId = selectedActionRecord.fields['On Idea'][0];
      const existingSupporters = selectedActionRecord.fields['By Users'] || [];
 
      //2. Check if user exists, otherwise registers user
      base('Users').select({
        view: 'Grid view',
        filterByFormula: `{Username} = '${user.username}'`,
      }).firstPage(function(err, userRecs) {
          if (err) { console.error(err); return; }
  
          let userRecord;
          if (userRecs.length === 0) {
            // Create user record here
  
          } else {
            userRecord = userRecs[0];
          }
          // console.log(userRecord);


          //3. Fetch all sibling Actions 
          base('Ideas').find(ideaId, function(err, ideaRecord) {
            if (err) { console.error(err); return; }
    
            const filterStr = ideaRecord.fields['Actions'].reduce((acc, recID) => {
              return `${acc}RECORD_ID() = '${recID}', `;
            }, 'OR(').slice(0, -2) + ')';
      
            base('Actions').select({
              view: 'Grid view',
              filterByFormula: filterStr,
            }).firstPage(function(err, actionRecords) {
                if (err) { console.error(err); return; }

                //@future: 4. Clear any user's previous selection 
                const lastSelectedAction = actionRecords.find((eachAction) => {
                  const userRecIdArr = eachAction.fields['By Users'] || [];
                  return userRecIdArr.find((eachSupporterId) => {
                    return eachSupporterId === userRecord.id;
                  });
                });
                // console.log('lastSelectedAction : ');
                // console.log(lastSelectedAction);
                

                //5. Update Actions with user's newly selected Action
                base('Actions').update([
                  {
                    'id': selectedActionId,
                    'fields': {
                      'By Users': [...existingSupporters, userRecord.id]
                    }
                  },
                ], function(err, updatedRecords) {
                  if (err) { console.error(err); return; }
                  updatedRecords.forEach(function(updatedRecord) {
                    const updatedActionRecords = actionRecords.map((actionRec) => {
                      if (actionRec.id === updatedRecord.id) {
                        return updatedRecord;
                      }

                      return actionRec;
                    });

                    const updatedIdeaRecord = {
                      ...ideaRecord,
                      fields: { 
                        ...ideaRecord.fields,
                        'Participation Count': updatedRecord.fields['Action Type'] === 'Participate' ? ideaRecord.fields['Participation Count'] + 1 : ideaRecord.fields['Participation Count'],
                        'Support Count': updatedRecord.fields['Action Type'] !== 'Downvote' ? ideaRecord.fields['Support Count'] + 1 : ideaRecord.fields['Support Count'],
                      }
                    };

                    //6. Update displayed record with newly added count (use editMessage https://core.telegram.org/bots/api#editmessagetext)
                    ctx.editMessageText(BotService.makeDetailsPageTextContent(updatedIdeaRecord, updatedActionRecords, selectedActionId), {
                      parse_mode: 'MarkdownV2',
                      //TODO: give next steps here
                      // reply_markup: BotService.makeDetailsPageKeyboard(actionRecords, selectedActionId)
                      reply_markup: BotService.makeMainMenuKeyboard(),
                    });
                    ctx.answerCbQuery('多謝回應！');
                  });
                });
      
               
                

            });
          }); // End of 3.

      }); // End of 2.
    }); // End of 1.


  }


  @TelegramActionHandler({ message: '' })
  async onMessage(ctx: ContextMessageUpdate) {
    switch (ctx.message.text ) {
      case '/browseIdeas':
        this.onBrowseIdeas(ctx);
        break;
      case '/submitIdea':
      case '/submitIdeas':
        this.onSubmitIdea(ctx);
        break;
      default:
        await ctx.reply(`You say "${ctx.message.text}".`)

    }
  }
}